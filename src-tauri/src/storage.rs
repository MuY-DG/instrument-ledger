use std::fs::{self, OpenOptions};
use std::path::{Component, Path, PathBuf};

use base64::Engine;
use rusqlite::Connection;
use uuid::Uuid;
use walkdir::WalkDir;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ResolvedAppPaths {
    pub data_dir: PathBuf,
    pub webview_data_dir: Option<PathBuf>,
    pub using_install_dir: bool,
}

fn is_dir_writable(dir: &Path) -> bool {
    if fs::create_dir_all(dir).is_err() {
        return false;
    }
    let probe = dir.join(format!(".write_probe_{}", Uuid::new_v4()));
    match OpenOptions::new().write(true).create_new(true).open(&probe) {
        Ok(file) => {
            drop(file);
            let _ = fs::remove_file(&probe);
            true
        }
        Err(_) => false,
    }
}

/// Resolves the active application data directory (and Windows WebView2 directory).
///
/// - On Windows: prefers `<install_dir>/data` and `<install_dir>/webview` next to the
///   executable so all application data lives at the installation location by default.
///   Falls back to `app_data_dir/data` if the installation directory is not writable.
/// - On macOS/Linux: uses the standard `app_data_dir/data`.
pub fn resolve_app_paths_with_platform(
    is_windows: bool,
    exe_path: Option<&Path>,
    app_data_dir: &Path,
) -> ResolvedAppPaths {
    if is_windows {
        if let Some(exe_dir) = exe_path.and_then(|p| p.parent()) {
            let install_data_dir = exe_dir.join("data");
            if is_dir_writable(&install_data_dir) {
                let install_webview_dir = exe_dir.join("webview");
                let webview_data_dir = if is_dir_writable(&install_webview_dir) {
                    Some(install_webview_dir)
                } else {
                    None
                };
                return ResolvedAppPaths {
                    data_dir: install_data_dir,
                    webview_data_dir,
                    using_install_dir: true,
                };
            }
        }
    }

    ResolvedAppPaths {
        data_dir: app_data_dir.join("data"),
        webview_data_dir: None,
        using_install_dir: false,
    }
}

pub fn resolve_app_paths(app_data_dir: &Path) -> ResolvedAppPaths {
    let exe_path = std::env::current_exe().ok();
    resolve_app_paths_with_platform(
        cfg!(target_os = "windows"),
        exe_path.as_deref(),
        app_data_dir,
    )
}

fn copy_tree_recursive(src: &Path, dst: &Path) -> Result<(), String> {
    for entry in WalkDir::new(src).into_iter().filter_map(|e| e.ok()) {
        let rel = entry
            .path()
            .strip_prefix(src)
            .map_err(|e| format!("迁移路径处理失败: {}", e))?;
        if rel.as_os_str().is_empty() {
            continue;
        }
        let target = dst.join(rel);
        if entry.file_type().is_dir() {
            fs::create_dir_all(&target).map_err(|e| format!("创建迁移目录失败: {}", e))?;
        } else if entry.file_type().is_file() {
            if let Some(parent) = target.parent() {
                fs::create_dir_all(parent).map_err(|e| format!("创建迁移父目录失败: {}", e))?;
            }
            fs::copy(entry.path(), &target).map_err(|e| format!("迁移文件失败: {}", e))?;
        }
    }
    Ok(())
}

/// One-time automatic migration from legacy `%APPDATA%/<bundle-id>/data` into
/// `<install_dir>/data` on Windows when upgrading from an earlier release.
pub fn migrate_legacy_data_dir_if_needed(
    legacy_data_dir: &Path,
    target_data_dir: &Path,
) -> Result<bool, String> {
    if legacy_data_dir == target_data_dir {
        return Ok(false);
    }
    let legacy_db = legacy_data_dir.join("ledger.db");
    let target_db = target_data_dir.join("ledger.db");
    let marker = legacy_data_dir.join(".migrated_to_install_dir");

    if target_db.exists() || !legacy_db.exists() || marker.exists() {
        return Ok(false);
    }

    fs::create_dir_all(target_data_dir)
        .map_err(|e| format!("创建安装位置数据目录失败: {}", e))?;

    // Flush any SQLite WAL pages into ledger.db before copying
    if let Ok(conn) = Connection::open(&legacy_db) {
        let _ = conn.execute_batch("PRAGMA wal_checkpoint(TRUNCATE);");
    }

    for folder in ["images", "reports", "app_icons", "workbench", "sync_backups"] {
        let src_dir = legacy_data_dir.join(folder);
        if src_dir.is_dir() {
            copy_tree_recursive(&src_dir, &target_data_dir.join(folder))?;
        }
    }

    let legacy_sync_cfg = legacy_data_dir.join("sync_config.json");
    if legacy_sync_cfg.is_file() {
        let target_sync_cfg = target_data_dir.join("sync_config.json");
        if !target_sync_cfg.exists() {
            fs::copy(&legacy_sync_cfg, &target_sync_cfg)
                .map_err(|e| format!("迁移同步配置失败: {}", e))?;
        }
    }

    let tmp_db = target_data_dir.join(format!(".ledger.db.migrating.{}", Uuid::new_v4()));
    if let Err(e) = fs::copy(&legacy_db, &tmp_db) {
        let _ = fs::remove_file(&tmp_db);
        return Err(format!("迁移数据库失败: {}", e));
    }
    if let Err(e) = fs::rename(&tmp_db, &target_db) {
        let _ = fs::remove_file(&tmp_db);
        return Err(format!("提交迁移数据库失败: {}", e));
    }

    let _ = fs::write(&marker, format!("{}\n", target_data_dir.display()));
    Ok(true)
}

pub fn ensure_storage_dirs(data_dir: &Path) -> Result<(), String> {
    fs::create_dir_all(data_dir.join("images"))
        .map_err(|e| format!("创建图片目录失败: {}", e))?;
    fs::create_dir_all(data_dir.join("reports"))
        .map_err(|e| format!("创建报告目录失败: {}", e))?;
    fs::create_dir_all(data_dir.join("app_icons"))
        .map_err(|e| format!("创建应用图标目录失败: {}", e))?;
    fs::create_dir_all(
        data_dir
            .join("workbench")
            .join("pdf-balloon")
            .join("sources"),
    )
    .map_err(|e| format!("创建工具台缓存目录失败: {}", e))?;
    Ok(())
}

/// Safely resolve a relative stored path (e.g. "images/abc.jpg", "reports/1/xyz.pdf", or "app_icons/abc.png") inside data_dir
pub fn resolve_stored_path(data_dir: &Path, rel_path: &str) -> Result<PathBuf, String> {
    let trimmed = rel_path.trim();
    if trimmed.is_empty() {
        return Err("文件路径为空".to_string());
    }
    let rel = Path::new(trimmed);
    for comp in rel.components() {
        match comp {
            Component::Normal(_) => {}
            _ => return Err("非法文件路径".to_string()),
        }
    }
    let first = rel
        .components()
        .next()
        .and_then(|c| c.as_os_str().to_str())
        .unwrap_or("");
    if first != "images" && first != "reports" && first != "app_icons" {
        return Err("仅允许访问受管附件目录".to_string());
    }
    Ok(data_dir.join(rel))
}

/// Safely resolve a syncable blob path inside data_dir (images/, reports/, or workbench/)
pub fn resolve_sync_blob_path(data_dir: &Path, rel_path: &str) -> Result<PathBuf, String> {
    let trimmed = rel_path.trim();
    if trimmed.is_empty() {
        return Err("文件路径为空".to_string());
    }
    let rel = Path::new(trimmed);
    for comp in rel.components() {
        match comp {
            Component::Normal(_) => {}
            _ => return Err("非法文件路径".to_string()),
        }
    }
    let first = rel
        .components()
        .next()
        .and_then(|c| c.as_os_str().to_str())
        .unwrap_or("");
    if first != "images" && first != "reports" && first != "workbench" {
        return Err("仅允许同步受管数据目录".to_string());
    }
    Ok(data_dir.join(rel))
}

fn clean_ext(filename: &str, fallback: &str) -> String {
    let ext = Path::new(filename)
        .extension()
        .and_then(|s| s.to_str())
        .unwrap_or(fallback)
        .to_lowercase();
    let cleaned: String = ext.chars().filter(|c| c.is_ascii_alphanumeric()).collect();
    if cleaned.is_empty() {
        fallback.to_string()
    } else {
        cleaned
    }
}

pub fn save_image_from_path(data_dir: &Path, src_path: &Path) -> Result<String, String> {
    ensure_storage_dirs(data_dir)?;
    let filename = src_path
        .file_name()
        .and_then(|s| s.to_str())
        .unwrap_or("image.png");
    let ext = clean_ext(filename, "png");
    let rel = format!("images/{}.{}", Uuid::new_v4(), ext);
    let dest = data_dir.join(&rel);
    fs::copy(src_path, &dest).map_err(|e| format!("保存位置图片失败: {}", e))?;
    Ok(rel)
}

pub fn save_image_from_base64(
    data_dir: &Path,
    base64_str: &str,
    filename_hint: Option<&str>,
) -> Result<String, String> {
    ensure_storage_dirs(data_dir)?;
    let raw_b64 = match base64_str.find(',') {
        Some(idx) => &base64_str[idx + 1..],
        None => base64_str,
    };
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(raw_b64.trim())
        .map_err(|e| format!("解码图片数据失败: {}", e))?;
    let ext = clean_ext(filename_hint.unwrap_or("photo.jpg"), "jpg");
    let rel = format!("images/{}.{}", Uuid::new_v4(), ext);
    let dest = data_dir.join(&rel);
    fs::write(&dest, bytes).map_err(|e| format!("写入图片文件失败: {}", e))?;
    Ok(rel)
}

pub fn save_app_icon_from_base64(data_dir: &Path, base64_str: &str) -> Result<String, String> {
    ensure_storage_dirs(data_dir)?;
    let raw_b64 = match base64_str.find(',') {
        Some(idx) => &base64_str[idx + 1..],
        None => base64_str,
    };
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(raw_b64.trim())
        .map_err(|e| format!("解码图标数据失败: {}", e))?;
    if bytes.len() < 8 || &bytes[..8] != b"\x89PNG\r\n\x1a\n" {
        return Err("自定义图标数据格式无效，需要 PNG 图像".to_string());
    }
    let rel = format!("app_icons/{}.png", Uuid::new_v4());
    let dest = data_dir.join(&rel);
    fs::write(&dest, bytes).map_err(|e| format!("保存应用图标失败: {}", e))?;
    Ok(rel)
}

pub fn save_report_from_path(
    data_dir: &Path,
    instrument_id: i64,
    src_path: &Path,
) -> Result<(String, String, String, i64), String> {
    ensure_storage_dirs(data_dir)?;
    let orig_name = src_path
        .file_name()
        .and_then(|s| s.to_str())
        .unwrap_or("report.pdf")
        .to_string();
    let ext = clean_ext(&orig_name, "pdf");
    let inst_dir = data_dir.join("reports").join(instrument_id.to_string());
    fs::create_dir_all(&inst_dir).map_err(|e| format!("创建仪器报告目录失败: {}", e))?;

    let rel = format!("reports/{}/{}.{}", instrument_id, Uuid::new_v4(), ext);
    let dest = data_dir.join(&rel);
    let copied = fs::copy(src_path, &dest).map_err(|e| format!("保存校验报告失败: {}", e))?;
    Ok((orig_name, rel, ext, copied as i64))
}

pub fn save_report_from_base64(
    data_dir: &Path,
    instrument_id: i64,
    base64_str: &str,
    orig_name: &str,
) -> Result<(String, String, String, i64), String> {
    ensure_storage_dirs(data_dir)?;
    let raw_b64 = match base64_str.find(',') {
        Some(idx) => &base64_str[idx + 1..],
        None => base64_str,
    };
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(raw_b64.trim())
        .map_err(|e| format!("解码报告文件失败: {}", e))?;
    let safe_name = if orig_name.trim().is_empty() {
        "report.pdf".to_string()
    } else {
        orig_name.trim().to_string()
    };
    let ext = clean_ext(&safe_name, "pdf");
    let inst_dir = data_dir.join("reports").join(instrument_id.to_string());
    fs::create_dir_all(&inst_dir).map_err(|e| format!("创建仪器报告目录失败: {}", e))?;

    let rel = format!("reports/{}/{}.{}", instrument_id, Uuid::new_v4(), ext);
    let dest = data_dir.join(&rel);
    let size = bytes.len() as i64;
    fs::write(&dest, bytes).map_err(|e| format!("写入校验报告失败: {}", e))?;
    Ok((safe_name, rel, ext, size))
}

pub fn remove_stored_file(data_dir: &Path, rel_path: &str) {
    if rel_path.trim().is_empty() {
        return;
    }
    if let Ok(full) = resolve_stored_path(data_dir, rel_path) {
        let _ = fs::remove_file(full);
    }
}

pub fn mime_from_ext(ext: &str) -> &'static str {
    match ext.to_lowercase().as_str() {
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "webp" => "image/webp",
        "gif" => "image/gif",
        "bmp" => "image/bmp",
        "svg" => "image/svg+xml",
        "pdf" => "application/pdf",
        _ => "application/octet-stream",
    }
}

pub fn dir_total_size(path: &Path) -> u64 {
    if !path.exists() {
        return 0;
    }
    walkdir::WalkDir::new(path)
        .into_iter()
        .filter_map(|e| e.ok())
        .filter(|e| e.file_type().is_file())
        .filter_map(|e| e.metadata().ok())
        .map(|m| m.len())
        .sum()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_resolve_app_paths_platform_defaults() {
        let root = std::env::temp_dir().join(format!("inst_paths_test_{}", Uuid::new_v4()));
        let install_dir = root.join("install");
        let exe_path = install_dir.join("InstrumentLedger.exe");
        let app_data_dir = root.join("roaming_app_data");
        fs::create_dir_all(&install_dir).unwrap();

        // Non-Windows always uses app_data_dir/data and system default WebView dir
        let mac_paths = resolve_app_paths_with_platform(false, Some(&exe_path), &app_data_dir);
        assert!(!mac_paths.using_install_dir);
        assert_eq!(mac_paths.data_dir, app_data_dir.join("data"));
        assert_eq!(mac_paths.webview_data_dir, None);

        // Windows prefers <install_dir>/data and <install_dir>/webview when writable
        let win_paths = resolve_app_paths_with_platform(true, Some(&exe_path), &app_data_dir);
        assert!(win_paths.using_install_dir);
        assert_eq!(win_paths.data_dir, install_dir.join("data"));
        assert_eq!(win_paths.webview_data_dir, Some(install_dir.join("webview")));

        // Windows falls back to app_data_dir/data if exe_path is missing
        let win_fallback = resolve_app_paths_with_platform(true, None, &app_data_dir);
        assert!(!win_fallback.using_install_dir);
        assert_eq!(win_fallback.data_dir, app_data_dir.join("data"));
        assert_eq!(win_fallback.webview_data_dir, None);

        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn test_migrate_legacy_data_dir_once() {
        let root = std::env::temp_dir().join(format!("inst_migrate_test_{}", Uuid::new_v4()));
        let legacy_dir = root.join("roaming").join("data");
        let target_dir = root.join("install").join("data");

        ensure_storage_dirs(&legacy_dir).unwrap();
        let conn = crate::db::init_db(&legacy_dir.join("ledger.db")).unwrap();
        conn.execute(
            "INSERT INTO instruments (category, seq_no, department, name, serial_no, created_at, updated_at)
             VALUES ('gauge', 1, '品质部', '千分尺', 'M-001', '2026-11-28', '2026-11-28')",
            [],
        )
        .unwrap();
        drop(conn);

        fs::write(legacy_dir.join("images").join("loc.png"), b"png-bytes").unwrap();
        fs::create_dir_all(legacy_dir.join("reports").join("1")).unwrap();
        fs::write(legacy_dir.join("reports").join("1").join("r.pdf"), b"%PDF-1.4").unwrap();
        fs::write(legacy_dir.join("sync_config.json"), b"{\"enabled\":true}").unwrap();

        let migrated = migrate_legacy_data_dir_if_needed(&legacy_dir, &target_dir).unwrap();
        assert!(migrated);
        assert!(target_dir.join("ledger.db").exists());
        assert!(legacy_dir.join(".migrated_to_install_dir").exists());
        assert_eq!(
            fs::read(target_dir.join("images").join("loc.png")).unwrap(),
            b"png-bytes"
        );
        assert_eq!(
            fs::read(target_dir.join("reports").join("1").join("r.pdf")).unwrap(),
            b"%PDF-1.4"
        );
        assert_eq!(
            fs::read(target_dir.join("sync_config.json")).unwrap(),
            b"{\"enabled\":true}"
        );

        let migrated_conn = Connection::open(target_dir.join("ledger.db")).unwrap();
        let name: String = migrated_conn
            .query_row("SELECT name FROM instruments WHERE serial_no = 'M-001'", [], |r| {
                r.get(0)
            })
            .unwrap();
        assert_eq!(name, "千分尺");
        drop(migrated_conn);

        // Even if target ledger.db is later wiped (e.g. factory reset), marker prevents re-migration
        fs::remove_file(target_dir.join("ledger.db")).unwrap();
        let migrated_again = migrate_legacy_data_dir_if_needed(&legacy_dir, &target_dir).unwrap();
        assert!(!migrated_again);

        let _ = fs::remove_dir_all(&root);
    }
}
