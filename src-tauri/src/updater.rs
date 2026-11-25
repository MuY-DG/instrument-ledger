use std::time::Duration;

use tauri::{AppHandle, Emitter};
use tauri_plugin_updater::{Update, UpdaterExt};
use url::Url;

use crate::models::{UpdateCheckResult, UpdateDownloadProgress};

#[derive(Clone)]
pub struct PendingUpdate {
    pub repo: String,
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

fn build_manifest_endpoints(repo: &str, proxy_url: &str) -> Result<Vec<Url>, String> {
    let direct_str = format!(
        "https://github.com/{}/releases/latest/download/latest.json",
        repo
    );
    let direct_url =
        Url::parse(&direct_str).map_err(|e| format!("构造更新地址失败: {}", e))?;

    let mut endpoints = Vec::with_capacity(2);
    if !proxy_url.trim().is_empty() {
        let proxied_str = apply_proxy(&direct_str, proxy_url);
        if let Ok(proxied_url) = Url::parse(&proxied_str) {
            if proxied_url.scheme() == "https" {
                endpoints.push(proxied_url);
            }
        }
    }
    endpoints.push(direct_url);
    Ok(endpoints)
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

pub async fn check_github_release(
    app: &AppHandle,
    github_repo: &str,
    proxy_url: &str,
) -> Result<(UpdateCheckResult, Option<PendingUpdate>), String> {
    let repo = normalize_repo(github_repo)?;
    let endpoints = build_manifest_endpoints(&repo, proxy_url)?;
    let current_version = env!("CARGO_PKG_VERSION").to_string();

    let updater = app
        .updater_builder()
        .endpoints(endpoints)
        .map_err(|e| format!("配置更新源失败: {}", e))?
        .timeout(Duration::from_secs(20))
        .build()
        .map_err(|e| format!("初始化更新客户端失败: {}", e))?;

    let maybe_update = updater.check().await.map_err(|e| {
        let msg = e.to_string();
        if msg.contains("404") || msg.to_lowercase().contains("release") {
            format!("未能读取到版本更新清单（latest.json），请确认仓库 {} 已发布支持自动更新的版本: {}", repo, msg)
        } else {
            format!("连接更新源检查更新失败，请检查网络或代理设置: {}", msg)
        }
    })?;

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
        };
        let pending = PendingUpdate { repo, update };
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
        };
        Ok((result, None))
    }
}

async fn download_with_progress(
    app: &AppHandle,
    update: &Update,
    label: &str,
) -> Result<Vec<u8>, String> {
    let mut downloaded: u64 = 0;
    let app_clone = app.clone();
    let label_owned = label.to_string();

    emit_progress(app, 0, 0, 0.0, "downloading", label);

    update
        .download(
            move |chunk_len, content_len| {
                downloaded = downloaded.saturating_add(chunk_len as u64);
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
        .map_err(|e| e.to_string())
}

pub async fn download_and_install_update(
    app: &AppHandle,
    pending: Option<PendingUpdate>,
    github_repo: &str,
    proxy_url: &str,
) -> Result<String, String> {
    let repo = normalize_repo(github_repo)?;
    let mut update = match pending {
        Some(p) if p.repo == repo => p.update,
        _ => {
            let (_, fresh) = check_github_release(app, &repo, proxy_url).await?;
            match fresh {
                Some(p) => p.update,
                None => return Err("当前已是最新版本，无需更新".to_string()),
            }
        }
    };

    // Give binary downloads generous timeout while keeping proxy fallback responsive
    update.timeout = Some(Duration::from_secs(300));

    let original_url = update.download_url.clone();
    let proxy_trimmed = proxy_url.trim();

    let bytes = if !proxy_trimmed.is_empty() {
        let proxied_str = apply_proxy(original_url.as_str(), proxy_trimmed);
        let tried_proxy = match Url::parse(&proxied_str) {
            Ok(proxied_url) => {
                update.download_url = proxied_url;
                download_with_progress(app, &update, "正在通过加速代理下载更新包...").await
            }
            Err(_) => Err("代理前缀格式无效".to_string()),
        };

        match tried_proxy {
            Ok(b) => b,
            Err(_proxy_err) => {
                // Automatic fallback to direct GitHub release download
                update.download_url = original_url.clone();
                download_with_progress(
                    app,
                    &update,
                    "代理节点不可用，已自动切换直连下载...",
                )
                .await
                .map_err(|e| format!("代理与直连下载更新均失败，请检查网络设置: {}", e))?
            }
        }
    } else {
        download_with_progress(app, &update, "正在从 GitHub 下载更新包...")
            .await
            .map_err(|e| format!("下载更新包失败: {}", e))?
    };

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
    }

    #[test]
    fn test_build_manifest_endpoints_with_fallback() {
        let eps = build_manifest_endpoints("MuY-DG/instrument-ledger", "https://gh-proxy.com/")
            .unwrap();
        assert_eq!(eps.len(), 2);
        assert_eq!(
            eps[0].as_str(),
            "https://gh-proxy.com/https://github.com/MuY-DG/instrument-ledger/releases/latest/download/latest.json"
        );
        assert_eq!(
            eps[1].as_str(),
            "https://github.com/MuY-DG/instrument-ledger/releases/latest/download/latest.json"
        );

        let direct_only = build_manifest_endpoints("MuY-DG/instrument-ledger", "").unwrap();
        assert_eq!(direct_only.len(), 1);
    }
}
