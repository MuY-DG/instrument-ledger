use std::collections::HashSet;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, Condvar, Mutex};
use std::time::{Duration, Instant};

use tauri::{AppHandle, Emitter};
use tauri_plugin_updater::{Update, UpdaterExt};
use url::Url;

use crate::models::{ReleaseHistoryItem, UpdateCheckResult, UpdateDownloadProgress};

/// Built-in zero-cost public GitHub mirror acceleration pool (all verified against
/// static Release `latest.json` redirects & binary downloads; integrity is strictly
/// enforced by Tauri's Ed25519 signature verification).
pub const BUILTIN_PROXY_POOL: &[&str] = &[
    "https://gh-proxy.com/",
    "https://ghfast.top/",
    "https://gh-proxy.org/",
    "https://cdn.gh-proxy.org/",
    "https://edgeone.gh-proxy.org/",
];

const CHECK_CHANNEL_TIMEOUT: Duration = Duration::from_secs(10);
const CHECK_HEDGE_DELAY: Duration = Duration::from_millis(2500);
const DOWNLOAD_TOTAL_TIMEOUT: Duration = Duration::from_secs(240);
const DOWNLOAD_FIRST_BYTE_TIMEOUT: Duration = Duration::from_secs(15);
const DOWNLOAD_STALL_TIMEOUT: Duration = Duration::from_secs(25);

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum UpdateChannel {
    Proxy(String),
    Direct,
}

impl UpdateChannel {
    pub fn label(&self) -> String {
        match self {
            UpdateChannel::Direct => "GitHub 直连".to_string(),
            UpdateChannel::Proxy(prefix) => Url::parse(prefix)
                .ok()
                .and_then(|u| u.host_str().map(|h| h.to_string()))
                .unwrap_or_else(|| prefix.trim_end_matches('/').to_string()),
        }
    }

    pub fn dedup_key(&self) -> String {
        match self {
            UpdateChannel::Direct => "__direct__".to_string(),
            UpdateChannel::Proxy(prefix) => prefix.to_ascii_lowercase(),
        }
    }

    pub fn apply_to_url(&self, target_url: &str) -> Result<Url, String> {
        let final_str = match self {
            UpdateChannel::Direct => target_url.to_string(),
            UpdateChannel::Proxy(prefix) => apply_proxy(target_url, prefix),
        };
        Url::parse(&final_str).map_err(|e| format!("构造更新地址失败: {}", e))
    }
}

#[derive(Clone)]
pub struct PendingUpdate {
    pub repo: String,
    pub proxy_config: String,
    pub preferred_channel: UpdateChannel,
    pub update: Update,
}

pub fn normalize_repo(raw: &str) -> Result<String, String> {
    let trimmed = raw
        .trim()
        .trim_end_matches('/')
        .trim_end_matches(".git");
    if trimmed.is_empty() {
        return Err("请先在系统设置中配置 GitHub 仓库地址（例如：MuY-DG/instrument-ledger）".to_string());
    }
    let cleaned = if let Some(idx) = trimmed.find("github.com/") {
        &trimmed[idx + "github.com/".len()..]
    } else {
        trimmed
    };
    let parts: Vec<&str> = cleaned.split('/').filter(|p| !p.is_empty()).collect();
    if parts.len() < 2 {
        return Err("GitHub 仓库格式不正确，请填写如 owner/repo".to_string());
    }
    Ok(format!("{}/{}", parts[0], parts[1]))
}

pub fn apply_proxy(url: &str, proxy_prefix: &str) -> String {
    let prefix = proxy_prefix.trim();
    if prefix.is_empty() {
        return url.to_string();
    }
    if prefix.ends_with('/') {
        format!("{}{}", prefix, url)
    } else {
        format!("{}/{}", prefix, url)
    }
}

pub fn normalize_proxy_prefix(raw: &str) -> Option<String> {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return None;
    }
    let with_scheme = if trimmed.contains("://") {
        trimmed.to_string()
    } else {
        format!("https://{}", trimmed)
    };
    let parsed = Url::parse(&with_scheme).ok()?;
    if parsed.scheme() != "https" {
        return None;
    }
    let host = parsed.host_str()?;
    if host.eq_ignore_ascii_case("github.com") {
        return None;
    }
    let mut normalized = parsed.to_string();
    if !normalized.ends_with('/') {
        normalized.push('/');
    }
    Some(normalized)
}

pub fn parse_custom_proxies(raw: &str) -> Vec<String> {
    let mut seen = HashSet::new();
    let mut out = Vec::new();
    for token in raw.split(|c: char| matches!(c, ',' | '，' | ';' | '；' | '\n' | '\r' | ' ' | '\t')) {
        if let Some(norm) = normalize_proxy_prefix(token) {
            if seen.insert(norm.to_ascii_lowercase()) {
                out.push(norm);
            }
        }
    }
    out
}

fn push_unique_channel(
    channels: &mut Vec<UpdateChannel>,
    seen: &mut HashSet<String>,
    channel: UpdateChannel,
) {
    if seen.insert(channel.dedup_key()) {
        channels.push(channel);
    }
}

fn is_direct_first_keyword(raw: &str) -> bool {
    let trimmed = raw.trim();
    trimmed.eq_ignore_ascii_case("direct") || trimmed == "直连"
}

/// Builds the ordered multi-node channel list for both manifest checks and binary downloads.
/// - When `proxy_url` is empty (default): uses the built-in multi-node acceleration pool
///   (`gh-proxy.com` first, then fallbacks), with Direct GitHub as the final fallback.
/// - When `proxy_url` is `"direct"` / `"直连"`: tries Direct GitHub first, falling back to
///   the built-in mirror pool when direct connectivity is blocked or slow.
/// - When `proxy_url` has custom prefix(es): user-specified proxy prefix(es) go first,
///   followed by the remaining built-in mirror pool, and Direct GitHub last.
pub fn build_update_channels(proxy_url: &str) -> Vec<UpdateChannel> {
    let mut channels = Vec::with_capacity(BUILTIN_PROXY_POOL.len() + 3);
    let mut seen = HashSet::new();

    if is_direct_first_keyword(proxy_url) {
        push_unique_channel(&mut channels, &mut seen, UpdateChannel::Direct);
        for builtin in BUILTIN_PROXY_POOL {
            if let Some(norm) = normalize_proxy_prefix(builtin) {
                push_unique_channel(&mut channels, &mut seen, UpdateChannel::Proxy(norm));
            }
        }
        return channels;
    }

    for custom in parse_custom_proxies(proxy_url) {
        push_unique_channel(&mut channels, &mut seen, UpdateChannel::Proxy(custom));
    }
    for builtin in BUILTIN_PROXY_POOL {
        if let Some(norm) = normalize_proxy_prefix(builtin) {
            push_unique_channel(&mut channels, &mut seen, UpdateChannel::Proxy(norm));
        }
    }
    push_unique_channel(&mut channels, &mut seen, UpdateChannel::Direct);
    channels
}

fn is_github_url(url: &Url) -> bool {
    match url.host_str() {
        Some(host) => {
            let lower = host.to_ascii_lowercase();
            lower == "github.com"
                || lower.ends_with(".github.com")
                || lower == "githubusercontent.com"
                || lower.ends_with(".githubusercontent.com")
        }
        None => false,
    }
}

/// Builds download channels prioritizing the channel that just succeeded during update check
/// (unless the user explicitly edited the proxy configuration since the check).
pub fn build_download_channels(
    original_url: &Url,
    proxy_url: &str,
    preferred: Option<&UpdateChannel>,
    proxy_matches_pending: bool,
) -> Vec<UpdateChannel> {
    if !is_github_url(original_url) {
        return vec![UpdateChannel::Direct];
    }

    let base = build_update_channels(proxy_url);
    let Some(pref) = preferred else {
        return base;
    };

    let mut channels = Vec::with_capacity(base.len() + 1);
    let mut seen = HashSet::new();

    if proxy_matches_pending {
        push_unique_channel(&mut channels, &mut seen, pref.clone());
        for ch in base {
            push_unique_channel(&mut channels, &mut seen, ch);
        }
    } else {
        // User changed proxy input right before downloading: honor new custom proxies first,
        // then reuse the recently verified node before falling back to the rest.
        for custom in parse_custom_proxies(proxy_url) {
            push_unique_channel(&mut channels, &mut seen, UpdateChannel::Proxy(custom));
        }
        push_unique_channel(&mut channels, &mut seen, pref.clone());
        for ch in base {
            push_unique_channel(&mut channels, &mut seen, ch);
        }
    }

    channels
}

fn extract_asset_name(url: &Url) -> String {
    url.path_segments()
        .and_then(|segs| segs.last())
        .filter(|s| !s.is_empty())
        .unwrap_or("InstrumentLedger-Update")
        .to_string()
}

fn emit_progress(
    app: &AppHandle,
    downloaded: u64,
    total: u64,
    percent: f64,
    phase: &str,
    message: &str,
) {
    let _ = app.emit(
        "update-download-progress",
        UpdateDownloadProgress {
            downloaded,
            total,
            percent,
            phase: phase.to_string(),
            message: message.to_string(),
        },
    );
}

fn signal_done(signal: &Arc<(Mutex<bool>, Condvar)>) {
    let (lock, cvar) = &**signal;
    if let Ok(mut done) = lock.lock() {
        *done = true;
        cvar.notify_all();
    }
}

enum ProbeEvent {
    AttemptFinished {
        channel: UpdateChannel,
        outcome: Result<Option<Update>, String>,
    },
    HedgeTimerFired,
}

fn spawn_manifest_probe(
    app: &AppHandle,
    direct_manifest_url: &str,
    channel: UpdateChannel,
    tx: tauri::async_runtime::Sender<ProbeEvent>,
) -> tauri::async_runtime::JoinHandle<()> {
    let app_clone = app.clone();
    let direct_url_owned = direct_manifest_url.to_string();

    tauri::async_runtime::spawn(async move {
        let outcome = match channel.apply_to_url(&direct_url_owned) {
            Ok(endpoint_url) if endpoint_url.scheme() == "https" => {
                match app_clone
                    .updater_builder()
                    .endpoints(vec![endpoint_url])
                    .map_err(|e| format!("配置更新源失败: {}", e))
                    .and_then(|b| {
                        b.timeout(CHECK_CHANNEL_TIMEOUT)
                            .build()
                            .map_err(|e| format!("初始化更新客户端失败: {}", e))
                    }) {
                    Ok(updater) => updater.check().await.map_err(|e| e.to_string()),
                    Err(e) => Err(e),
                }
            }
            Ok(_) => Err("更新源仅支持 HTTPS 协议".to_string()),
            Err(e) => Err(e),
        };

        let _ = tx
            .send(ProbeEvent::AttemptFinished { channel, outcome })
            .await;
    })
}

fn format_check_failure(repo: &str, total_channels: usize, errors: &[(String, String)]) -> String {
    let missing_manifest_hits = errors
        .iter()
        .filter(|(_, msg)| {
            let lower = msg.to_lowercase();
            msg.contains("404") || lower.contains("release json") || lower.contains("valid release")
        })
        .count();

    let sample_err = errors
        .first()
        .map(|(label, msg)| format!("{} ({})", label, msg))
        .unwrap_or_else(|| "网络连接异常".to_string());

    if missing_manifest_hits > 0 && missing_manifest_hits * 2 >= errors.len().max(1) {
        format!(
            "未能读取到版本更新清单（latest.json），请确认仓库 {} 已发布支持自动更新的版本（已尝试 {} 条线路）: {}",
            repo, total_channels, sample_err
        )
    } else {
        format!(
            "已自动尝试 {} 条更新线路（含内置多节点加速与 GitHub 直连）均失败，请检查网络连接或代理设置: {}",
            total_channels, sample_err
        )
    }
}

pub async fn check_github_release(
    app: &AppHandle,
    github_repo: &str,
    proxy_url: &str,
) -> Result<(UpdateCheckResult, Option<PendingUpdate>), String> {
    let repo = normalize_repo(github_repo)?;
    let proxy_trimmed = proxy_url.trim().to_string();
    let channels = build_update_channels(&proxy_trimmed);
    let total_channels = channels.len();
    let direct_manifest_url = format!(
        "https://github.com/{}/releases/latest/download/latest.json",
        repo
    );
    let current_version = env!("CARGO_PKG_VERSION").to_string();

    let (tx, mut rx) = tauri::async_runtime::channel::<ProbeEvent>(total_channels + 2);
    let mut handles: Vec<tauri::async_runtime::JoinHandle<()>> = Vec::with_capacity(total_channels);

    // 1) Launch the primary channel first to stay polite when the primary node is healthy.
    handles.push(spawn_manifest_probe(
        app,
        &direct_manifest_url,
        channels[0].clone(),
        tx.clone(),
    ));
    let mut remaining_pending: usize = 1;
    let mut fallbacks_launched = total_channels <= 1;

    // 2) If primary hangs longer than CHECK_HEDGE_DELAY, automatically race all fallback nodes
    //    in parallel instead of waiting sequentially on a dead/blocked proxy.
    let timer_signal = Arc::new((Mutex::new(false), Condvar::new()));
    if !fallbacks_launched {
        let sig_clone = Arc::clone(&timer_signal);
        let tx_timer = tx.clone();
        tauri::async_runtime::spawn_blocking(move || {
            let (lock, cvar) = &*sig_clone;
            if let Ok(guard) = lock.lock() {
                if !*guard {
                    let (guard_after, _) = cvar.wait_timeout(guard, CHECK_HEDGE_DELAY).unwrap();
                    if !*guard_after {
                        let _ = tx_timer.blocking_send(ProbeEvent::HedgeTimerFired);
                    }
                }
            }
        });
    }

    let mut errors: Vec<(String, String)> = Vec::new();
    let mut winner: Option<(UpdateChannel, Option<Update>)> = None;

    while remaining_pending > 0 {
        let Some(event) = rx.recv().await else {
            break;
        };

        match event {
            ProbeEvent::HedgeTimerFired => {
                if !fallbacks_launched {
                    fallbacks_launched = true;
                    for ch in channels.iter().skip(1) {
                        handles.push(spawn_manifest_probe(
                            app,
                            &direct_manifest_url,
                            ch.clone(),
                            tx.clone(),
                        ));
                        remaining_pending += 1;
                    }
                }
            }
            ProbeEvent::AttemptFinished { channel, outcome } => {
                remaining_pending = remaining_pending.saturating_sub(1);
                match outcome {
                    Ok(maybe_update) => {
                        winner = Some((channel, maybe_update));
                        break;
                    }
                    Err(err_msg) => {
                        errors.push((channel.label(), err_msg));
                        // Primary failed fast -> launch fallback race immediately without waiting
                        // for the hedge timer.
                        if !fallbacks_launched {
                            fallbacks_launched = true;
                            signal_done(&timer_signal);
                            for ch in channels.iter().skip(1) {
                                handles.push(spawn_manifest_probe(
                                    app,
                                    &direct_manifest_url,
                                    ch.clone(),
                                    tx.clone(),
                                ));
                                remaining_pending += 1;
                            }
                        }
                    }
                }
            }
        }
    }

    signal_done(&timer_signal);
    for h in handles {
        h.abort();
    }

    let Some((winning_channel, maybe_update)) = winner else {
        return Err(format_check_failure(&repo, total_channels, &errors));
    };

    let resolved_source = winning_channel.label();

    if let Some(update) = maybe_update {
        let latest_version = update.version.trim().trim_start_matches(['v', 'V']).to_string();
        let asset_name = extract_asset_name(&update.download_url);
        let html_url = format!(
            "https://github.com/{}/releases/tag/v{}",
            repo, latest_version
        );
        let published_at = update.date.map(|d| d.to_string()).unwrap_or_default();
        let result = UpdateCheckResult {
            has_update: true,
            current_version,
            latest_version,
            release_notes: update.body.clone().unwrap_or_default(),
            published_at,
            download_url: update.download_url.to_string(),
            html_url,
            asset_name,
            asset_size: 0,
            resolved_source,
        };
        let pending = PendingUpdate {
            repo,
            proxy_config: proxy_trimmed,
            preferred_channel: winning_channel,
            update,
        };
        Ok((result, Some(pending)))
    } else {
        let result = UpdateCheckResult {
            has_update: false,
            current_version: current_version.clone(),
            latest_version: current_version,
            release_notes: String::new(),
            published_at: String::new(),
            download_url: String::new(),
            html_url: format!("https://github.com/{}/releases", repo),
            asset_name: String::new(),
            asset_size: 0,
            resolved_source,
        };
        Ok((result, None))
    }
}

/// Downloads a single candidate update URL with first-byte and mid-stream stall watchdogs,
/// so hanging or throttled-to-zero nodes automatically abort and fail over to the next node.
/// Note: `Update::download` also verifies the Ed25519 signature automatically, so corrupted or
/// HTML error responses from a faulty proxy are rejected and trigger failover cleanly.
async fn download_single_channel_with_watchdog(
    app: &AppHandle,
    update: Update,
    label: &str,
) -> Result<Vec<u8>, String> {
    let start = Instant::now();
    let downloaded_atomic = Arc::new(AtomicU64::new(0));
    let last_activity_ms = Arc::new(AtomicU64::new(0));
    let cancelled = Arc::new(AtomicBool::new(false));
    let done_signal = Arc::new((Mutex::new(false), Condvar::new()));

    let (tx, mut rx) = tauri::async_runtime::channel::<Result<Vec<u8>, String>>(2);

    emit_progress(app, 0, 0, 0.0, "downloading", label);

    let dl_handle = {
        let app_clone = app.clone();
        let label_owned = label.to_string();
        let downloaded_ref = Arc::clone(&downloaded_atomic);
        let activity_ref = Arc::clone(&last_activity_ms);
        let cancelled_ref = Arc::clone(&cancelled);
        let tx_dl = tx.clone();

        tauri::async_runtime::spawn(async move {
            let mut downloaded: u64 = 0;
            let res = update
                .download(
                    move |chunk_len, content_len| {
                        if cancelled_ref.load(Ordering::Relaxed) {
                            return;
                        }
                        downloaded = downloaded.saturating_add(chunk_len as u64);
                        downloaded_ref.store(downloaded, Ordering::Relaxed);
                        activity_ref.store(start.elapsed().as_millis() as u64, Ordering::Relaxed);

                        let total = content_len.unwrap_or(0);
                        let percent = if total > 0 {
                            ((downloaded as f64 / total as f64) * 100.0).min(100.0)
                        } else {
                            0.0
                        };
                        emit_progress(
                            &app_clone,
                            downloaded,
                            total,
                            percent,
                            "downloading",
                            &label_owned,
                        );
                    },
                    || {},
                )
                .await
                .map_err(|e| e.to_string());

            let _ = tx_dl.send(res).await;
        })
    };

    // Lightweight watchdog checking first-byte timeout & mid-stream stall
    {
        let downloaded_ref = Arc::clone(&downloaded_atomic);
        let activity_ref = Arc::clone(&last_activity_ms);
        let sig_clone = Arc::clone(&done_signal);
        let tx_wd = tx.clone();

        tauri::async_runtime::spawn_blocking(move || {
            let first_byte_ms = DOWNLOAD_FIRST_BYTE_TIMEOUT.as_millis() as u64;
            let stall_ms = DOWNLOAD_STALL_TIMEOUT.as_millis() as u64;
            let (lock, cvar) = &*sig_clone;
            let Ok(mut guard) = lock.lock() else {
                return;
            };
            while !*guard {
                let (next_guard, _) = cvar.wait_timeout(guard, Duration::from_secs(1)).unwrap();
                guard = next_guard;
                if *guard {
                    break;
                }
                let elapsed = start.elapsed().as_millis() as u64;
                let received = downloaded_ref.load(Ordering::Relaxed);
                let last_act = activity_ref.load(Ordering::Relaxed);

                if received == 0 && elapsed >= first_byte_ms {
                    let _ = tx_wd.blocking_send(Err("节点响应超时（15 秒内未收到数据）".to_string()));
                    break;
                }
                if received > 0 && elapsed.saturating_sub(last_act) >= stall_ms {
                    let _ = tx_wd.blocking_send(Err("节点传输停滞超时（25 秒无新数据）".to_string()));
                    break;
                }
            }
        });
    }

    let result = rx
        .recv()
        .await
        .unwrap_or_else(|| Err("下载任务意外中止".to_string()));

    cancelled.store(true, Ordering::Relaxed);
    signal_done(&done_signal);
    dl_handle.abort();

    result
}

pub async fn download_and_install_update(
    app: &AppHandle,
    pending: Option<PendingUpdate>,
    github_repo: &str,
    proxy_url: &str,
) -> Result<String, String> {
    let repo = normalize_repo(github_repo)?;
    let proxy_trimmed = proxy_url.trim();

    let (mut update, preferred_channel, proxy_matches_pending) = match pending {
        Some(p) if p.repo == repo => {
            let matches = p.proxy_config == proxy_trimmed;
            (p.update, Some(p.preferred_channel), matches)
        }
        _ => {
            let (_, fresh) = check_github_release(app, &repo, proxy_trimmed).await?;
            match fresh {
                Some(p) => (p.update, Some(p.preferred_channel), true),
                None => return Err("当前已是最新版本，无需更新".to_string()),
            }
        }
    };

    update.timeout = Some(DOWNLOAD_TOTAL_TIMEOUT);

    let original_url = update.download_url.clone();
    let channels = build_download_channels(
        &original_url,
        proxy_trimmed,
        preferred_channel.as_ref(),
        proxy_matches_pending,
    );
    let total_channels = channels.len();

    let mut downloaded_bytes: Option<Vec<u8>> = None;
    let mut last_err = String::new();
    let mut prev_label: Option<String> = None;

    for (idx, channel) in channels.iter().enumerate() {
        let ch_label = channel.label();
        let target_url = match channel.apply_to_url(original_url.as_str()) {
            Ok(u) => u,
            Err(e) => {
                last_err = format!("{} ({})", ch_label, e);
                prev_label = Some(ch_label);
                continue;
            }
        };

        let status_msg = match (idx, channel, prev_label.as_deref()) {
            (0, UpdateChannel::Direct, _) => "正在从 GitHub 直连下载更新包...".to_string(),
            (0, UpdateChannel::Proxy(_), _) => {
                format!("正在通过加速节点 {} 下载更新包...", ch_label)
            }
            (_, UpdateChannel::Direct, Some(prev)) => {
                format!("节点 {} 不可用，已切换 GitHub 直连下载...", prev)
            }
            (_, UpdateChannel::Proxy(_), Some(prev)) => {
                format!("节点 {} 不可用，已切换节点 {} 下载...", prev, ch_label)
            }
            (_, UpdateChannel::Direct, None) => "正在从 GitHub 直连下载更新包...".to_string(),
            (_, UpdateChannel::Proxy(_), None) => {
                format!("正在通过加速节点 {} 下载更新包...", ch_label)
            }
        };

        let mut attempt_update = update.clone();
        attempt_update.download_url = target_url;

        match download_single_channel_with_watchdog(app, attempt_update, &status_msg).await {
            Ok(bytes) => {
                downloaded_bytes = Some(bytes);
                break;
            }
            Err(err) => {
                last_err = format!("{} ({})", ch_label, err);
                prev_label = Some(ch_label);
            }
        }
    }

    let bytes = downloaded_bytes.ok_or_else(|| {
        format!(
            "已尝试 {} 条下载线路（含多节点加速与直连）均失败，请检查网络后重试: {}",
            total_channels, last_err
        )
    })?;

    emit_progress(
        app,
        bytes.len() as u64,
        bytes.len() as u64,
        100.0,
        "installing",
        "签名校验通过，正在替换安装新版程序...",
    );

    // On Windows (NSIS passive), install() spawns the updater installer and exits cleanly.
    // On macOS, install() replaces the .app bundle in place and returns Ok(()), then we restart.
    update
        .install(&bytes)
        .map_err(|e| format!("校验或安装更新包失败: {}", e))?;

    emit_progress(
        app,
        bytes.len() as u64,
        bytes.len() as u64,
        100.0,
        "restarting",
        "安装完成，正在自动重启应用...",
    );

    std::thread::sleep(Duration::from_millis(250));
    app.restart()
}

#[derive(serde::Deserialize)]
struct GithubReleaseDto {
    #[serde(default)]
    tag_name: String,
    #[serde(default)]
    name: Option<String>,
    #[serde(default)]
    body: Option<String>,
    #[serde(default)]
    published_at: Option<String>,
    #[serde(default)]
    created_at: Option<String>,
    #[serde(default)]
    html_url: String,
    #[serde(default)]
    draft: bool,
    #[serde(default)]
    prerelease: bool,
}

fn unescape_basic_xml(input: &str) -> String {
    input
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&quot;", "\"")
        .replace("&#39;", "'")
        .replace("&apos;", "'")
        .replace("&amp;", "&")
}

fn strip_html_tags(input: &str) -> String {
    let mut out = String::with_capacity(input.len());
    let mut in_tag = false;
    let normalized = input
        .replace("<br/>", "\n")
        .replace("<br />", "\n")
        .replace("<br>", "\n")
        .replace("</p>", "\n")
        .replace("</li>", "\n")
        .replace("<li>", "- ");
    for ch in normalized.chars() {
        match ch {
            '<' => in_tag = true,
            '>' => in_tag = false,
            _ if !in_tag => out.push(ch),
            _ => {}
        }
    }
    out.trim().to_string()
}

fn extract_xml_tag(block: &str, tag: &str) -> Option<String> {
    let open_prefix = format!("<{}", tag);
    let start_pos = block.find(&open_prefix)?;
    let after_open = &block[start_pos + open_prefix.len()..];
    let gt_pos = after_open.find('>')?;
    let content_start = &after_open[gt_pos + 1..];
    let close_tag = format!("</{}>", tag);
    let end_pos = content_start.find(&close_tag)?;
    Some(content_start[..end_pos].trim().to_string())
}

fn extract_atom_link_href(block: &str) -> Option<String> {
    let pos = block.find("<link ")?;
    let tail = &block[pos..];
    let href_pos = tail.find("href=\"")?;
    let after = &tail[href_pos + 6..];
    let end = after.find('"')?;
    Some(after[..end].to_string())
}

fn parse_releases_atom(xml: &str, repo: &str) -> Vec<ReleaseHistoryItem> {
    let mut items = Vec::new();
    let mut cursor = xml;
    while let Some(idx) = cursor.find("<entry>") {
        let rest = &cursor[idx + 7..];
        let Some(end) = rest.find("</entry>") else {
            break;
        };
        let block = &rest[..end];
        cursor = &rest[end + 8..];

        let href = extract_atom_link_href(block)
            .unwrap_or_else(|| format!("https://github.com/{}/releases", repo));
        let tag_from_href = href
            .rsplit('/')
            .next()
            .unwrap_or_default()
            .trim()
            .to_string();
        let title = extract_xml_tag(block, "title")
            .map(|s| unescape_basic_xml(&s))
            .unwrap_or_else(|| tag_from_href.clone());
        let tag_name = if !tag_from_href.is_empty() {
            tag_from_href
        } else {
            title.clone()
        };
        let version = tag_name
            .trim_start_matches(['v', 'V'])
            .to_string();
        let published_at = extract_xml_tag(block, "updated").unwrap_or_default();
        let body = extract_xml_tag(block, "content")
            .map(|s| strip_html_tags(&unescape_basic_xml(&s)))
            .unwrap_or_default();

        if !tag_name.is_empty() {
            items.push(ReleaseHistoryItem {
                version,
                tag_name,
                name: title,
                published_at,
                body,
                html_url: href,
                prerelease: false,
            });
        }
        if items.len() >= 20 {
            break;
        }
    }
    items
}

pub async fn fetch_github_release_history(
    repo_input: &str,
    proxy_url: &str,
) -> Result<Vec<ReleaseHistoryItem>, String> {
    let repo = normalize_repo(repo_input)?;
    let _ = rustls::crypto::ring::default_provider().install_default();

    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(12))
        .user_agent("InstrumentLedger")
        .build()
        .map_err(|e| format!("初始化网络客户端失败: {}", e))?;

    // 1. Primary path: GitHub REST API (full Markdown release notes & metadata)
    let api_url = format!("https://api.github.com/repos/{}/releases?per_page=20", repo);
    let mut last_err = String::new();
    match client
        .get(&api_url)
        .header("Accept", "application/vnd.github+json")
        .send()
        .await
    {
        Ok(resp) if resp.status().is_success() => {
            if let Ok(text) = resp.text().await {
                if let Ok(list) = serde_json::from_str::<Vec<GithubReleaseDto>>(&text) {
                    let items: Vec<ReleaseHistoryItem> = list
                        .into_iter()
                        .filter(|r| !r.draft)
                        .map(|r| {
                            let tag = r.tag_name.trim().to_string();
                            let version = tag.trim_start_matches(['v', 'V']).to_string();
                            let name = r
                                .name
                                .as_deref()
                                .map(str::trim)
                                .filter(|s| !s.is_empty())
                                .unwrap_or(&tag)
                                .to_string();
                            let published_at = r
                                .published_at
                                .or(r.created_at)
                                .unwrap_or_default();
                            ReleaseHistoryItem {
                                version,
                                tag_name: tag,
                                name,
                                published_at,
                                body: r.body.unwrap_or_default().trim().to_string(),
                                html_url: r.html_url,
                                prerelease: r.prerelease,
                            }
                        })
                        .collect();
                    return Ok(items);
                }
            }
        }
        Ok(resp) => {
            last_err = format!("GitHub API HTTP {}", resp.status().as_u16());
        }
        Err(e) => {
            last_err = e.to_string();
        }
    }

    // 2. Resilient fallback: releases.atom via configured / built-in multi-node mirror channels
    let atom_url = format!("https://github.com/{}/releases.atom", repo);
    let channels = build_update_channels(proxy_url);
    for ch in channels {
        let Ok(url) = ch.apply_to_url(&atom_url) else {
            continue;
        };
        if let Ok(resp) = client.get(url).send().await {
            if resp.status().is_success() {
                if let Ok(xml) = resp.text().await {
                    let parsed = parse_releases_atom(&xml, &repo);
                    if !parsed.is_empty() {
                        return Ok(parsed);
                    }
                }
            }
        }
    }

    Err(if last_err.is_empty() {
        format!("未能从 {} 获取发布历史，请检查网络连接", repo)
    } else {
        format!("获取发布历史失败: {}", last_err)
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_normalize_repo_and_proxy() {
        assert_eq!(
            normalize_repo("https://github.com/MuY-DG/instrument-ledger.git").unwrap(),
            "MuY-DG/instrument-ledger"
        );
        assert_eq!(
            normalize_repo("MuY-DG/instrument-ledger/").unwrap(),
            "MuY-DG/instrument-ledger"
        );
        assert_eq!(
            apply_proxy(
                "https://github.com/a/b/releases/latest/download/latest.json",
                "https://gh-proxy.com"
            ),
            "https://gh-proxy.com/https://github.com/a/b/releases/latest/download/latest.json"
        );
        assert_eq!(
            apply_proxy("https://github.com/a/b", ""),
            "https://github.com/a/b"
        );
        assert_eq!(
            normalize_proxy_prefix("ghfast.top").as_deref(),
            Some("https://ghfast.top/")
        );
        assert_eq!(normalize_proxy_prefix("http://insecure.example.com"), None);
        assert_eq!(normalize_proxy_prefix("https://github.com/"), None);
    }

    #[test]
    fn test_parse_custom_proxies_and_dedup() {
        let parsed = parse_custom_proxies(
            "https://my-proxy.example.com, ghfast.top；https://MY-PROXY.example.com/\nhttps://gh-proxy.org",
        );
        assert_eq!(
            parsed,
            vec![
                "https://my-proxy.example.com/".to_string(),
                "https://ghfast.top/".to_string(),
                "https://gh-proxy.org/".to_string(),
            ]
        );
    }

    #[test]
    fn test_build_update_channels_default_custom_and_direct_first() {
        // Empty proxy uses built-in multi-node acceleration pool first, then Direct
        let empty_default = build_update_channels("");
        assert_eq!(empty_default.len(), BUILTIN_PROXY_POOL.len() + 1);
        assert_eq!(
            empty_default[0],
            UpdateChannel::Proxy("https://gh-proxy.com/".to_string())
        );
        assert_eq!(empty_default.last(), Some(&UpdateChannel::Direct));

        // Explicit default proxy matches empty default order without duplication
        let default_chs = build_update_channels("https://gh-proxy.com/");
        assert_eq!(default_chs, empty_default);

        // Custom proxy goes ahead of all built-in nodes and deduplicates
        let custom_chs =
            build_update_channels("https://worker.example.com, https://ghfast.top/");
        assert_eq!(custom_chs.len(), BUILTIN_PROXY_POOL.len() + 2);
        assert_eq!(
            custom_chs[0],
            UpdateChannel::Proxy("https://worker.example.com/".to_string())
        );
        assert_eq!(
            custom_chs[1],
            UpdateChannel::Proxy("https://ghfast.top/".to_string())
        );
        assert_eq!(custom_chs.last(), Some(&UpdateChannel::Direct));

        // Explicit "direct" / "直连" puts Direct first, then falls back to built-in mirror pool
        for kw in ["direct", "DIRECT", "直连"] {
            let direct_first = build_update_channels(kw);
            assert_eq!(direct_first.len(), BUILTIN_PROXY_POOL.len() + 1);
            assert_eq!(direct_first[0], UpdateChannel::Direct);
            assert_eq!(
                direct_first[1],
                UpdateChannel::Proxy("https://gh-proxy.com/".to_string())
            );
        }
    }

    #[test]
    fn test_build_download_channels_prioritizes_winning_node() {
        let gh_asset = Url::parse(
            "https://github.com/MuY-DG/instrument-ledger/releases/download/v1.3.0/app.tar.gz",
        )
        .unwrap();
        let winner = UpdateChannel::Proxy("https://ghfast.top/".to_string());

        // Same proxy config -> winning channel goes straight to index 0
        let dl_chs = build_download_channels(&gh_asset, "https://gh-proxy.com/", Some(&winner), true);
        assert_eq!(dl_chs[0], winner);
        assert_eq!(dl_chs.len(), BUILTIN_PROXY_POOL.len() + 1);

        // User changed proxy input -> new custom proxy goes first, then previously verified node
        let dl_changed = build_download_channels(
            &gh_asset,
            "https://custom.example.com/",
            Some(&winner),
            false,
        );
        assert_eq!(
            dl_changed[0],
            UpdateChannel::Proxy("https://custom.example.com/".to_string())
        );
        assert_eq!(dl_changed[1], winner);

        // Non-GitHub asset URL should not be prefixed with GitHub mirrors
        let oss_asset = Url::parse("https://cdn.example.com/releases/app.tar.gz").unwrap();
        assert_eq!(
            build_download_channels(&oss_asset, "https://gh-proxy.com/", Some(&winner), true),
            vec![UpdateChannel::Direct]
        );
    }
}
