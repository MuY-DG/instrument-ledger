use std::fs::{self, File};
use std::io::Write;
use std::time::Duration;

use futures_util::StreamExt;
use semver::Version;
use serde::Deserialize;
use tauri::{AppHandle, Emitter};
use tauri_plugin_opener::OpenerExt;

use crate::models::{UpdateCheckResult, UpdateDownloadProgress};

#[derive(Debug, Deserialize)]
struct GithubRelease {
    tag_name: String,
    body: Option<String>,
    published_at: Option<String>,
    html_url: String,
    assets: Vec<GithubAsset>,
}

#[derive(Debug, Deserialize)]
struct GithubAsset {
    name: String,
    size: u64,
    browser_download_url: String,
}

fn normalize_repo(raw: &str) -> Result<String, String> {
    let trimmed = raw
        .trim()
        .trim_end_matches('/')
        .trim_end_matches(".git");
    if trimmed.is_empty() {
        return Err("请先在系统设置中配置 GitHub 仓库地址（例如：username/instrument-ledger）".to_string());
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

fn apply_proxy(url: &str, proxy_prefix: &str) -> String {
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

fn pick_best_asset(assets: &[GithubAsset]) -> Option<&GithubAsset> {
    if cfg!(target_os = "windows") {
        assets
            .iter()
            .find(|a| a.name.to_lowercase().ends_with("-setup.exe"))
            .or_else(|| {
                assets
                    .iter()
                    .find(|a| a.name.to_lowercase().ends_with(".exe"))
            })
            .or_else(|| {
                assets
                    .iter()
                    .find(|a| a.name.to_lowercase().ends_with(".msi"))
            })
            .or_else(|| assets.first())
    } else if cfg!(target_os = "macos") {
        let arch_hint = if cfg!(target_arch = "aarch64") {
            "aarch64"
        } else {
            "x64"
        };
        assets
            .iter()
            .find(|a| {
                let low = a.name.to_lowercase();
                low.ends_with(".dmg") && low.contains("universal")
            })
            .or_else(|| {
                assets.iter().find(|a| {
                    let low = a.name.to_lowercase();
                    low.ends_with(".dmg")
                        && (low.contains(arch_hint)
                            || (cfg!(target_arch = "aarch64") && low.contains("arm64"))
                            || (cfg!(target_arch = "x86_64") && low.contains("x86_64")))
                })
            })
            .or_else(|| {
                assets
                    .iter()
                    .find(|a| a.name.to_lowercase().ends_with(".dmg"))
            })
            .or_else(|| {
                assets
                    .iter()
                    .find(|a| a.name.to_lowercase().ends_with(".app.tar.gz"))
            })
            .or_else(|| assets.first())
    } else {
        assets
            .iter()
            .find(|a| a.name.to_lowercase().ends_with(".appimage"))
            .or_else(|| {
                assets
                    .iter()
                    .find(|a| a.name.to_lowercase().ends_with(".deb"))
            })
            .or_else(|| assets.first())
    }
}

pub async fn check_github_release(
    github_repo: &str,
    _proxy_url: &str,
) -> Result<UpdateCheckResult, String> {
    let repo = normalize_repo(github_repo)?;
    let api_url = format!("https://api.github.com/repos/{}/releases/latest", repo);

    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(15))
        .user_agent(format!("InstrumentLedger/{}", env!("CARGO_PKG_VERSION")))
        .build()
        .map_err(|e| format!("初始化网络客户端失败: {}", e))?;

    let resp = client
        .get(&api_url)
        .header("Accept", "application/vnd.github+json")
        .send()
        .await
        .map_err(|e| format!("连接 GitHub 检查更新失败，请检查网络: {}", e))?;

    if resp.status().as_u16() == 404 {
        return Err("仓库尚未发布任何 Release 版本，请先在 GitHub 创建 Release".to_string());
    }
    if !resp.status().is_success() {
        return Err(format!("GitHub API 返回状态码: {}", resp.status()));
    }

    let release: GithubRelease = resp
        .json()
        .await
        .map_err(|e| format!("解析更新信息失败: {}", e))?;

    let current_str = env!("CARGO_PKG_VERSION");
    let latest_clean = release.tag_name.trim().trim_start_matches(['v', 'V']);

    let has_update = match (Version::parse(latest_clean), Version::parse(current_str)) {
        (Ok(latest), Ok(current)) => latest > current,
        _ => latest_clean != current_str,
    };

    let best_asset = pick_best_asset(&release.assets);
    let (download_url, asset_name, asset_size) = match best_asset {
        Some(a) => (a.browser_download_url.clone(), a.name.clone(), a.size),
        None => (String::new(), String::new(), 0),
    };

    Ok(UpdateCheckResult {
        has_update,
        current_version: current_str.to_string(),
        latest_version: latest_clean.to_string(),
        release_notes: release.body.unwrap_or_default(),
        published_at: release.published_at.unwrap_or_default(),
        download_url,
        html_url: release.html_url,
        asset_name,
        asset_size,
    })
}

pub async fn download_and_launch_installer(
    app: &AppHandle,
    download_url: &str,
    asset_name: &str,
    proxy_url: &str,
) -> Result<String, String> {
    let raw_url = download_url.trim();
    if raw_url.is_empty() {
        return Err("没有可下载的安装包链接".to_string());
    }
    let proxy_trimmed = proxy_url.trim();

    let client = reqwest::Client::builder()
        .connect_timeout(Duration::from_secs(15))
        .timeout(Duration::from_secs(600))
        .user_agent(format!("InstrumentLedger/{}", env!("CARGO_PKG_VERSION")))
        .build()
        .map_err(|e| format!("初始化下载客户端失败: {}", e))?;

    let resp = if !proxy_trimmed.is_empty() {
        let proxied_url = apply_proxy(raw_url, proxy_trimmed);
        match client.get(&proxied_url).send().await {
            Ok(r) if r.status().is_success() => r,
            _ => {
                // Fallback to direct GitHub download if configured proxy is unavailable
                let direct = client
                    .get(raw_url)
                    .send()
                    .await
                    .map_err(|e| format!("代理与直连下载安装包均失败，请检查网络或更换代理前缀: {}", e))?;
                if !direct.status().is_success() {
                    return Err(format!("下载失败，服务器返回: {}", direct.status()));
                }
                direct
            }
        }
    } else {
        let direct = client
            .get(raw_url)
            .send()
            .await
            .map_err(|e| format!("下载安装包失败: {}", e))?;
        if !direct.status().is_success() {
            return Err(format!("下载失败，服务器返回: {}", direct.status()));
        }
        direct
    };

    let total = resp.content_length().unwrap_or(0);
    let update_dir = std::env::temp_dir().join("InstrumentLedger-Updates");
    fs::create_dir_all(&update_dir).map_err(|e| format!("创建临时下载目录失败: {}", e))?;

    let safe_name = std::path::Path::new(asset_name)
        .file_name()
        .and_then(|s| s.to_str())
        .unwrap_or("InstrumentLedger-Setup.exe");
    let dest_path = update_dir.join(safe_name);

    let mut file = File::create(&dest_path).map_err(|e| format!("创建安装文件失败: {}", e))?;
    let mut downloaded: u64 = 0;
    let mut stream = resp.bytes_stream();

    while let Some(chunk) = stream.next().await {
        let bytes = chunk.map_err(|e| format!("下载中断: {}", e))?;
        file.write_all(&bytes)
            .map_err(|e| format!("写入安装包失败: {}", e))?;
        downloaded += bytes.len() as u64;
        let percent = if total > 0 {
            ((downloaded as f64 / total as f64) * 100.0).min(100.0)
        } else {
            0.0
        };
        let _ = app.emit(
            "update-download-progress",
            UpdateDownloadProgress {
                downloaded,
                total,
                percent,
            },
        );
    }

    file.flush().map_err(|e| format!("保存安装包失败: {}", e))?;
    drop(file);

    let path_str = dest_path.to_string_lossy().to_string();
    app.opener()
        .open_path(&path_str, None::<&str>)
        .map_err(|e| format!("安装包已下载到 {}，但自动启动失败: {}", path_str, e))?;

    Ok(path_str)
}
