use std::net::IpAddr;
use std::str::FromStr;
use std::time::Duration;

use chrono::{DateTime, Utc};
use reqwest::header::{HeaderMap, HeaderName, HeaderValue};
use reqwest::{Client, Method, StatusCode};
use ring::hmac;
use url::Url;

use crate::sync_crypto::sha256_hex;

const CONNECT_TIMEOUT: Duration = Duration::from_secs(15);
const REQUEST_TIMEOUT: Duration = Duration::from_secs(120);
const TEST_TIMEOUT: Duration = Duration::from_secs(20);

#[derive(Debug, Clone)]
pub struct S3Credentials {
    pub endpoint: String,
    pub region: String,
    pub bucket: String,
    pub prefix: String,
    pub access_key_id: String,
    pub secret_access_key: String,
    pub force_path_style: bool,
}

#[derive(Debug)]
pub enum S3PutError {
    PreconditionFailed,
    Other(String),
}

impl S3PutError {
    pub fn into_message(self) -> String {
        match self {
            S3PutError::PreconditionFailed => {
                "远端清单在同步过程中已被其他设备更新，请重新检查同步状态".to_string()
            }
            S3PutError::Other(m) => m,
        }
    }
}

pub struct S3Client {
    http: Client,
    creds: S3Credentials,
    normalized_prefix: String,
}

pub fn normalize_prefix(raw: &str) -> String {
    raw.trim()
        .trim_matches('/')
        .split('/')
        .filter(|s| !s.trim().is_empty())
        .collect::<Vec<_>>()
        .join("/")
}

pub fn normalize_endpoint(raw: &str) -> Result<Url, String> {
    let trimmed = raw.trim().trim_end_matches('/');
    if trimmed.is_empty() {
        return Err("请填写 S3 Endpoint 地址".to_string());
    }
    let with_scheme = if trimmed.contains("://") {
        trimmed.to_string()
    } else {
        format!("https://{}", trimmed)
    };
    let parsed = Url::parse(&with_scheme).map_err(|e| format!("Endpoint 地址格式无效: {}", e))?;
    match parsed.scheme() {
        "https" | "http" => {}
        _ => return Err("Endpoint 仅支持 http 或 https 协议".to_string()),
    }
    if parsed.host_str().unwrap_or("").is_empty() {
        return Err("Endpoint 缺少有效主机名".to_string());
    }
    Ok(parsed)
}

fn should_use_path_style(endpoint_url: &Url, bucket: &str, force_path_style: bool) -> bool {
    if force_path_style {
        return true;
    }
    let host = endpoint_url.host_str().unwrap_or("");
    if host.eq_ignore_ascii_case("localhost") || IpAddr::from_str(host).is_ok() {
        return true;
    }
    // Dots in bucket names break wildcard TLS certs under virtual-hosted-style HTTPS
    if endpoint_url.scheme() == "https" && bucket.contains('.') {
        return true;
    }
    false
}

/// Builds the concrete request URL, Host header, and canonical URI path for an S3 object or bucket request.
pub fn build_s3_target(
    endpoint_raw: &str,
    bucket_raw: &str,
    object_key: Option<&str>,
    force_path_style: bool,
) -> Result<(Url, String, String), String> {
    let bucket = bucket_raw.trim();
    if bucket.is_empty() {
        return Err("请填写 Bucket 存储桶名称".to_string());
    }
    let mut url = normalize_endpoint(endpoint_raw)?;
    let orig_host = url
        .host_str()
        .ok_or_else(|| "Endpoint 缺少有效主机名".to_string())?
        .to_string();

    let use_path_style = should_use_path_style(&url, bucket, force_path_style);
    let base_path = url.path().trim_matches('/').to_string();

    let mut path_segments: Vec<String> = Vec::new();
    if !base_path.is_empty() {
        for seg in base_path.split('/').filter(|s| !s.is_empty()) {
            path_segments.push(seg.to_string());
        }
    }

    if use_path_style {
        path_segments.push(bucket.to_string());
    } else {
        // Guard against users accidentally pasting `<bucket>.<endpoint>` into endpoint field
        let expected_prefix = format!("{}.", bucket.to_ascii_lowercase());
        if !orig_host.to_ascii_lowercase().starts_with(&expected_prefix) {
            let vhost = format!("{}.{}", bucket, orig_host);
            url.set_host(Some(&vhost))
                .map_err(|e| format!("构造存储桶虚拟主机域名失败: {}", e))?;
        }
    }

    if let Some(key) = object_key {
        let clean_key = key.trim_start_matches('/');
        if !clean_key.is_empty() {
            for seg in clean_key.split('/') {
                if !seg.is_empty() {
                    path_segments.push(seg.to_string());
                }
            }
        }
    }

    let canonical_uri = if path_segments.is_empty() {
        "/".to_string()
    } else {
        format!(
            "/{}",
            path_segments
                .iter()
                .map(|s| aws_uri_encode(s, true))
                .collect::<Vec<_>>()
                .join("/")
        )
    };

    // Set exact encoded path on URL so reqwest transmits the identical path that we signed
    url.set_path(&canonical_uri);

    let host_header = match (url.host_str(), url.port()) {
        (Some(h), Some(p)) => format!("{}:{}", h, p),
        (Some(h), None) => h.to_string(),
        _ => return Err("无法解析目标主机地址".to_string()),
    };

    Ok((url, host_header, canonical_uri))
}

/// RFC 3986 percent-encoding strictly following AWS Signature Version 4 specification.
pub fn aws_uri_encode(input: &str, encode_slash: bool) -> String {
    let mut out = String::with_capacity(input.len());
    for byte in input.as_bytes() {
        let keep = matches!(
            *byte,
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~'
        ) || (!encode_slash && *byte == b'/');
        if keep {
            out.push(*byte as char);
        } else {
            out.push('%');
            out.push_str(&format!("{:02X}", byte));
        }
    }
    out
}

fn hmac_sha256(key: &[u8], data: &[u8]) -> Vec<u8> {
    let s_key = hmac::Key::new(hmac::HMAC_SHA256, key);
    hmac::sign(&s_key, data).as_ref().to_vec()
}

pub struct SigV4Headers {
    pub authorization: String,
    pub amz_date: String,
    pub content_sha256: String,
}

/// Computes AWS Signature Version 4 headers for an S3 request.
pub fn sign_v4_request(
    method: &str,
    canonical_uri: &str,
    query_params: &[(&str, &str)],
    host_header: &str,
    extra_headers: &[(&str, &str)],
    payload_sha256: &str,
    region: &str,
    access_key_id: &str,
    secret_access_key: &str,
    now: DateTime<Utc>,
) -> SigV4Headers {
    let amz_date = now.format("%Y%m%dT%H%M%SZ").to_string();
    let date_stamp = now.format("%Y%m%d").to_string();
    let clean_region = {
        let r = region.trim();
        if r.is_empty() {
            "auto"
        } else {
            r
        }
    };

    // 1. Canonical query string (sorted by encoded key, then encoded value)
    let mut encoded_query: Vec<(String, String)> = query_params
        .iter()
        .map(|(k, v)| (aws_uri_encode(k, true), aws_uri_encode(v, true)))
        .collect();
    encoded_query.sort();
    let canonical_query = encoded_query
        .into_iter()
        .map(|(k, v)| format!("{}={}", k, v))
        .collect::<Vec<_>>()
        .join("&");

    // 2. Canonical headers (lowercase key, trimmed value, sorted lexicographically)
    let mut headers: Vec<(String, String)> = vec![
        ("host".to_string(), host_header.trim().to_string()),
        (
            "x-amz-content-sha256".to_string(),
            payload_sha256.to_string(),
        ),
        ("x-amz-date".to_string(), amz_date.clone()),
    ];
    for (k, v) in extra_headers {
        let lk = k.trim().to_ascii_lowercase();
        let tv = v.trim().to_string();
        if !lk.is_empty() && !tv.is_empty() {
            headers.push((lk, tv));
        }
    }
    headers.sort_by(|a, b| a.0.cmp(&b.0));

    let mut canonical_headers = String::new();
    let mut signed_header_names = Vec::with_capacity(headers.len());
    for (k, v) in &headers {
        canonical_headers.push_str(k);
        canonical_headers.push(':');
        canonical_headers.push_str(v);
        canonical_headers.push('\n');
        signed_header_names.push(k.as_str());
    }
    let signed_headers = signed_header_names.join(";");

    // 3. Canonical request
    let canonical_request = format!(
        "{}\n{}\n{}\n{}\n{}\n{}",
        method,
        canonical_uri,
        canonical_query,
        canonical_headers,
        signed_headers,
        payload_sha256
    );
    let canonical_request_hash = sha256_hex(canonical_request.as_bytes());

    // 4. String to sign
    let credential_scope = format!("{}/{}/s3/aws4_request", date_stamp, clean_region);
    let string_to_sign = format!(
        "AWS4-HMAC-SHA256\n{}\n{}\n{}",
        amz_date, credential_scope, canonical_request_hash
    );

    // 5. Signing key & signature
    let k_secret = format!("AWS4{}", secret_access_key);
    let k_date = hmac_sha256(k_secret.as_bytes(), date_stamp.as_bytes());
    let k_region = hmac_sha256(&k_date, clean_region.as_bytes());
    let k_service = hmac_sha256(&k_region, b"s3");
    let k_signing = hmac_sha256(&k_service, b"aws4_request");
    let signature = hex::encode(hmac_sha256(&k_signing, string_to_sign.as_bytes()));

    let authorization = format!(
        "AWS4-HMAC-SHA256 Credential={}/{}, SignedHeaders={}, Signature={}",
        access_key_id.trim(),
        credential_scope,
        signed_headers,
        signature
    );

    SigV4Headers {
        authorization,
        amz_date,
        content_sha256: payload_sha256.to_string(),
    }
}

fn extract_xml_tag(xml: &str, tag: &str) -> Option<String> {
    let open = format!("<{}>", tag);
    let close = format!("</{}>", tag);
    let start = xml.find(&open)? + open.len();
    let end = xml[start..].find(&close)? + start;
    let val = xml[start..end].trim();
    if val.is_empty() {
        None
    } else {
        Some(val.to_string())
    }
}

fn format_s3_http_error(status: StatusCode, body: &str, context: &str) -> String {
    let code = extract_xml_tag(body, "Code").unwrap_or_default();
    let msg = extract_xml_tag(body, "Message").unwrap_or_default();
    let friendly = match code.as_str() {
        "InvalidAccessKeyId" => "Access Key ID 无效，请检查密钥配置".to_string(),
        "SignatureDoesNotMatch" => {
            "签名校验失败，请检查 Secret Access Key、Region 区域或寻址方式".to_string()
        }
        "NoSuchBucket" => "指定的 Bucket 存储桶不存在，请核对名称与 Endpoint".to_string(),
        "AccessDenied" => "访问被拒绝（AccessDenied），请确认密钥具备该存储桶读写权限".to_string(),
        "RequestTimeTooSkewed" => "本机系统时间与云端偏差过大，请校准系统时钟".to_string(),
        "PermanentRedirect" | "AuthorizationHeaderMalformed" => {
            format!(
                "Endpoint 或 Region 区域不匹配（{}）",
                if msg.is_empty() { &code } else { &msg }
            )
        }
        "SecondLevelDomainForbidden" => {
            "当前云厂商要求使用虚拟主机模式（请关闭「路径风格寻址」）".to_string()
        }
        _ => {
            if !code.is_empty() && !msg.is_empty() {
                format!("HTTP {} ({}: {})", status.as_u16(), code, msg)
            } else if !code.is_empty() {
                format!("HTTP {} ({})", status.as_u16(), code)
            } else {
                format!("HTTP {}", status.as_u16())
            }
        }
    };
    format!("{}失败: {}", context, friendly)
}

fn ensure_rustls_ring_provider() {
    let _ = rustls::crypto::ring::default_provider().install_default();
}

impl S3Client {
    pub fn new(creds: S3Credentials) -> Result<Self, String> {
        // Validate required parameters upfront
        normalize_endpoint(&creds.endpoint)?;
        if creds.bucket.trim().is_empty() {
            return Err("请填写 Bucket 存储桶名称".to_string());
        }
        if creds.access_key_id.trim().is_empty() {
            return Err("请填写 Access Key ID".to_string());
        }
        if creds.secret_access_key.trim().is_empty() {
            return Err("请填写 Secret Access Key".to_string());
        }

        ensure_rustls_ring_provider();
        let http = Client::builder()
            .connect_timeout(CONNECT_TIMEOUT)
            .timeout(REQUEST_TIMEOUT)
            .user_agent(concat!("InstrumentLedger/", env!("CARGO_PKG_VERSION")))
            .build()
            .map_err(|e| format!("初始化 HTTP 客户端失败: {}", e))?;

        let normalized_prefix = normalize_prefix(&creds.prefix);
        Ok(Self {
            http,
            creds,
            normalized_prefix,
        })
    }

    pub fn full_key(&self, rel_key: &str) -> String {
        let clean = rel_key.trim_start_matches('/');
        if self.normalized_prefix.is_empty() {
            clean.to_string()
        } else if clean.is_empty() {
            self.normalized_prefix.clone()
        } else {
            format!("{}/{}", self.normalized_prefix, clean)
        }
    }

    fn build_signed_headers(
        &self,
        method: &str,
        canonical_uri: &str,
        query_params: &[(&str, &str)],
        host_header: &str,
        extra_headers: &[(&str, &str)],
        payload_sha256: &str,
    ) -> Result<HeaderMap, String> {
        let sig = sign_v4_request(
            method,
            canonical_uri,
            query_params,
            host_header,
            extra_headers,
            payload_sha256,
            &self.creds.region,
            &self.creds.access_key_id,
            &self.creds.secret_access_key,
            Utc::now(),
        );

        let mut map = HeaderMap::new();
        map.insert(
            "host",
            HeaderValue::from_str(host_header)
                .map_err(|e| format!("无效 Host 请求头: {}", e))?,
        );
        map.insert(
            "x-amz-date",
            HeaderValue::from_str(&sig.amz_date)
                .map_err(|e| format!("无效日期请求头: {}", e))?,
        );
        map.insert(
            "x-amz-content-sha256",
            HeaderValue::from_str(&sig.content_sha256)
                .map_err(|e| format!("无效摘要请求头: {}", e))?,
        );
        map.insert(
            "authorization",
            HeaderValue::from_str(&sig.authorization)
                .map_err(|e| format!("无效签名请求头: {}", e))?,
        );
        for (k, v) in extra_headers {
            let name = HeaderName::from_bytes(k.as_bytes())
                .map_err(|e| format!("无效请求头名称 {}: {}", k, e))?;
            let val = HeaderValue::from_str(v)
                .map_err(|e| format!("无效请求头值 {}: {}", k, e))?;
            map.insert(name, val);
        }
        Ok(map)
    }

    /// Tests bucket connectivity & authentication using a minimal ListObjectsV2 (max-keys=1) call,
    /// which works with prefix-scoped IAM credentials as well as full-bucket keys.
    pub async fn test_connection(&self) -> Result<(), String> {
        let (mut url, host_header, canonical_uri) = build_s3_target(
            &self.creds.endpoint,
            &self.creds.bucket,
            None,
            self.creds.force_path_style,
        )?;

        let prefix_param = if self.normalized_prefix.is_empty() {
            String::new()
        } else {
            format!("{}/", self.normalized_prefix)
        };

        let mut query_params: Vec<(&str, &str)> = vec![("list-type", "2"), ("max-keys", "1")];
        if !prefix_param.is_empty() {
            query_params.push(("prefix", &prefix_param));
        }

        // Encode query string in identical sorted order as SigV4
        let mut encoded_query: Vec<(String, String)> = query_params
            .iter()
            .map(|(k, v)| (aws_uri_encode(k, true), aws_uri_encode(v, true)))
            .collect();
        encoded_query.sort();
        let query_str = encoded_query
            .into_iter()
            .map(|(k, v)| format!("{}={}", k, v))
            .collect::<Vec<_>>()
            .join("&");
        url.set_query(Some(&query_str));

        let empty_hash = sha256_hex(&[]);
        let headers = self.build_signed_headers(
            "GET",
            &canonical_uri,
            &query_params,
            &host_header,
            &[],
            &empty_hash,
        )?;

        let resp = self
            .http
            .request(Method::GET, url)
            .headers(headers)
            .timeout(TEST_TIMEOUT)
            .send()
            .await
            .map_err(|e| format!("连接 S3 服务失败，请检查 Endpoint 和网络: {}", e))?;

        let status = resp.status();
        if status.is_success() {
            return Ok(());
        }
        let body = resp.text().await.unwrap_or_default();
        Err(format_s3_http_error(status, &body, "连接测试"))
    }

    /// Downloads an object relative to sync prefix. Returns `Ok(None)` when object does not exist (404).
    pub async fn get_object(&self, rel_key: &str) -> Result<Option<(Vec<u8>, Option<String>)>, String> {
        let full = self.full_key(rel_key);
        let (url, host_header, canonical_uri) = build_s3_target(
            &self.creds.endpoint,
            &self.creds.bucket,
            Some(&full),
            self.creds.force_path_style,
        )?;
        let empty_hash = sha256_hex(&[]);
        let headers = self.build_signed_headers(
            "GET",
            &canonical_uri,
            &[],
            &host_header,
            &[],
            &empty_hash,
        )?;

        let resp = self
            .http
            .request(Method::GET, url)
            .headers(headers)
            .send()
            .await
            .map_err(|e| format!("读取远端对象 {} 失败: {}", rel_key, e))?;

        let status = resp.status();
        if status == StatusCode::NOT_FOUND {
            return Ok(None);
        }
        if !status.is_success() {
            let body = resp.text().await.unwrap_or_default();
            if extract_xml_tag(&body, "Code").as_deref() == Some("NoSuchKey") {
                return Ok(None);
            }
            return Err(format_s3_http_error(
                status,
                &body,
                &format!("下载 {}", rel_key),
            ));
        }

        let etag = resp
            .headers()
            .get("etag")
            .and_then(|v| v.to_str().ok())
            .map(|s| s.to_string());
        let bytes = resp
            .bytes()
            .await
            .map_err(|e| format!("读取远端数据流失败 ({}): {}", rel_key, e))?
            .to_vec();
        Ok(Some((bytes, etag)))
    }

    /// Uploads an object relative to sync prefix with optional conditional write (`If-Match` / `If-None-Match`).
    /// Falls back cleanly without conditional headers if a legacy S3 gateway returns 501 NotImplemented.
    pub async fn put_object(
        &self,
        rel_key: &str,
        data: Vec<u8>,
        content_type: &str,
        if_match: Option<&str>,
        if_none_match: bool,
    ) -> Result<Option<String>, S3PutError> {
        match self
            .put_object_once(rel_key, &data, content_type, if_match, if_none_match)
            .await
        {
            Ok(etag) => Ok(etag),
            Err(S3PutError::Other(msg))
                if (if_match.is_some() || if_none_match)
                    && (msg.contains("HTTP 501") || msg.contains("NotImplemented")) =>
            {
                self.put_object_once(rel_key, &data, content_type, None, false)
                    .await
            }
            Err(e) => Err(e),
        }
    }

    async fn put_object_once(
        &self,
        rel_key: &str,
        data: &[u8],
        content_type: &str,
        if_match: Option<&str>,
        if_none_match: bool,
    ) -> Result<Option<String>, S3PutError> {
        let full = self.full_key(rel_key);
        let (url, host_header, canonical_uri) = build_s3_target(
            &self.creds.endpoint,
            &self.creds.bucket,
            Some(&full),
            self.creds.force_path_style,
        )
        .map_err(S3PutError::Other)?;

        let payload_hash = sha256_hex(data);
        let mut extra: Vec<(&str, &str)> = vec![("content-type", content_type)];
        if let Some(etag) = if_match {
            extra.push(("if-match", etag));
        } else if if_none_match {
            extra.push(("if-none-match", "*"));
        }

        let headers = self
            .build_signed_headers(
                "PUT",
                &canonical_uri,
                &[],
                &host_header,
                &extra,
                &payload_hash,
            )
            .map_err(S3PutError::Other)?;

        let resp = self
            .http
            .request(Method::PUT, url)
            .headers(headers)
            .body(data.to_vec())
            .send()
            .await
            .map_err(|e| S3PutError::Other(format!("上传 {} 失败: {}", rel_key, e)))?;

        let status = resp.status();
        if status == StatusCode::PRECONDITION_FAILED {
            return Err(S3PutError::PreconditionFailed);
        }
        if !status.is_success() {
            let body = resp.text().await.unwrap_or_default();
            if extract_xml_tag(&body, "Code").as_deref() == Some("PreconditionFailed") {
                return Err(S3PutError::PreconditionFailed);
            }
            return Err(S3PutError::Other(format_s3_http_error(
                status,
                &body,
                &format!("上传 {}", rel_key),
            )));
        }

        let etag = resp
            .headers()
            .get("etag")
            .and_then(|v| v.to_str().ok())
            .map(|s| s.to_string());
        Ok(etag)
    }

    /// Best-effort delete of an object relative to sync prefix (treats 404 as success).
    pub async fn delete_object(&self, rel_key: &str) -> Result<(), String> {
        let full = self.full_key(rel_key);
        let (url, host_header, canonical_uri) = build_s3_target(
            &self.creds.endpoint,
            &self.creds.bucket,
            Some(&full),
            self.creds.force_path_style,
        )?;
        let empty_hash = sha256_hex(&[]);
        let headers = self.build_signed_headers(
            "DELETE",
            &canonical_uri,
            &[],
            &host_header,
            &[],
            &empty_hash,
        )?;

        let resp = self
            .http
            .request(Method::DELETE, url)
            .headers(headers)
            .send()
            .await
            .map_err(|e| format!("删除远端对象 {} 失败: {}", rel_key, e))?;

        let status = resp.status();
        if status.is_success() || status == StatusCode::NOT_FOUND {
            return Ok(());
        }
        let body = resp.text().await.unwrap_or_default();
        Err(format_s3_http_error(
            status,
            &body,
            &format!("删除 {}", rel_key),
        ))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::TimeZone;

    #[test]
    fn test_s3_url_building_virtual_hosted_and_path_style() {
        // Virtual-hosted-style (Aliyun OSS)
        let (url, host, uri) = build_s3_target(
            "https://oss-cn-hangzhou.aliyuncs.com",
            "jssk-ledger",
            Some("instrument-ledger/manifest.json"),
            false,
        )
        .unwrap();
        assert_eq!(
            url.as_str(),
            "https://jssk-ledger.oss-cn-hangzhou.aliyuncs.com/instrument-ledger/manifest.json"
        );
        assert_eq!(host, "jssk-ledger.oss-cn-hangzhou.aliyuncs.com");
        assert_eq!(uri, "/instrument-ledger/manifest.json");

        // Guard against user already pasting bucket in host
        let (url2, host2, _) = build_s3_target(
            "https://jssk-ledger.oss-cn-hangzhou.aliyuncs.com",
            "jssk-ledger",
            Some("manifest.json"),
            false,
        )
        .unwrap();
        assert_eq!(
            url2.as_str(),
            "https://jssk-ledger.oss-cn-hangzhou.aliyuncs.com/manifest.json"
        );
        assert_eq!(host2, "jssk-ledger.oss-cn-hangzhou.aliyuncs.com");

        // Path-style (Cloudflare R2)
        let (url3, host3, uri3) = build_s3_target(
            "https://abc123.r2.cloudflarestorage.com/",
            "my-bucket",
            Some("instrument-ledger/db/ledger_r1.db.gz"),
            true,
        )
        .unwrap();
        assert_eq!(
            url3.as_str(),
            "https://abc123.r2.cloudflarestorage.com/my-bucket/instrument-ledger/db/ledger_r1.db.gz"
        );
        assert_eq!(host3, "abc123.r2.cloudflarestorage.com");
        assert_eq!(uri3, "/my-bucket/instrument-ledger/db/ledger_r1.db.gz");

        // IP endpoint auto-forces path-style with non-default port preserved in Host
        let (url4, host4, uri4) = build_s3_target(
            "http://192.168.1.50:9000",
            "ledger",
            Some("manifest.json"),
            false,
        )
        .unwrap();
        assert_eq!(url4.as_str(), "http://192.168.1.50:9000/ledger/manifest.json");
        assert_eq!(host4, "192.168.1.50:9000");
        assert_eq!(uri4, "/ledger/manifest.json");
    }

    #[test]
    fn test_aws_sigv4_official_vector_get_object() {
        // Official AWS S3 SigV4 Example: GET Object
        // https://docs.aws.amazon.com/AmazonS3/latest/API/sig-v4-header-based-auth.html
        let dt = Utc.with_ymd_and_hms(2013, 5, 24, 0, 0, 0).unwrap();
        let empty_sha = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";
        let sig = sign_v4_request(
            "GET",
            "/test.txt",
            &[],
            "examplebucket.s3.amazonaws.com",
            &[("range", "bytes=0-9")],
            empty_sha,
            "us-east-1",
            "AKIAIOSFODNN7EXAMPLE",
            "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
            dt,
        );
        assert_eq!(sig.amz_date, "20130524T000000Z");
        assert_eq!(
            sig.authorization,
            "AWS4-HMAC-SHA256 Credential=AKIAIOSFODNN7EXAMPLE/20130524/us-east-1/s3/aws4_request, SignedHeaders=host;range;x-amz-content-sha256;x-amz-date, Signature=f0e8bdb87c964420e857bd35b5d6ed310bd44f0170aba48dd91039c6036bdb41"
        );
    }

    #[test]
    fn test_aws_uri_encode_unicode_and_spaces() {
        assert_eq!(aws_uri_encode("a b/c~1.pdf", true), "a%20b%2Fc~1.pdf");
        assert_eq!(aws_uri_encode("a b/c~1.pdf", false), "a%20b/c~1.pdf");
        assert_eq!(aws_uri_encode("台账", true), "%E5%8F%B0%E8%B4%A6");
    }
}
