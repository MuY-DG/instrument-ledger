use std::fs::{self, File};
use std::io::{Read, Write};
use std::path::{Path, PathBuf};

use chrono::Local;
use rusqlite::{params, Connection};
use uuid::Uuid;
use walkdir::WalkDir;
use zip::write::SimpleFileOptions;
use zip::{CompressionMethod, ZipArchive, ZipWriter};

use crate::db::{get_setting, init_db, now_iso, set_setting};
use crate::models::{BackupManifest, BackupResult, RestoreResult};
use crate::storage::ensure_storage_dirs;
use crate::sync_engine::CONFIG_SYNC_SETTING_KEYS;
use crate::workbench_store::get_backup_include_workbench;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct BackupScopeOptions {
    pub include_photos: bool,
    pub include_reports: bool,
    pub include_settings: bool,
    pub include_workbench: bool,
}

impl Default for BackupScopeOptions {
    fn default() -> Self {
        Self {
            include_photos: true,
            include_reports: true,
            include_settings: true,
            include_workbench: false,
        }
    }
}

pub fn get_backup_scope_options(conn: &Connection) -> BackupScopeOptions {
    let flag = |key: &str, default_on: bool| -> bool {
        match get_setting(conn, key).ok().flatten().as_deref() {
            Some("1") => true,
            Some("0") => false,
            _ => default_on,
        }
    };
    BackupScopeOptions {
        include_photos: flag("backup_include_photos", true),
        include_reports: flag("backup_include_reports", true),
        include_settings: flag("backup_include_settings", true),
        include_workbench: flag("backup_include_workbench", false),
    }
}

#[cfg(test)]
pub fn create_backup(
    conn: &Connection,
    data_dir: &Path,
    dest_zip_path: &Path,
) -> Result<BackupResult, String> {
    create_backup_with_options(conn, data_dir, dest_zip_path, false)
}

pub fn create_backup_with_options(
    conn: &Connection,
    data_dir: &Path,
    dest_zip_path: &Path,
    include_workbench: bool,
) -> Result<BackupResult, String> {
    create_backup_with_scope(
        conn,
        data_dir,
        dest_zip_path,
        BackupScopeOptions {
            include_photos: true,
            include_reports: true,
            include_settings: true,
            include_workbench,
        },
    )
}

pub fn create_backup_with_scope(
    conn: &Connection,
    data_dir: &Path,
    dest_zip_path: &Path,
    options: BackupScopeOptions,
) -> Result<BackupResult, String> {
    ensure_storage_dirs(data_dir)?;

    let instrument_count: usize = conn
        .query_row("SELECT COUNT(*) FROM instruments", [], |r| r.get(0))
        .unwrap_or(0);
    let report_count: usize = if options.include_reports {
        conn.query_row("SELECT COUNT(*) FROM calibration_reports", [], |r| r.get(0))
            .unwrap_or(0)
    } else {
        0
    };
    let wb_draft_count: usize = if options.include_workbench {
        conn.query_row("SELECT COUNT(*) FROM workbench_pdf_drafts", [], |r| r.get(0))
            .unwrap_or(0)
    } else {
        0
    };

    if instrument_count == 0 && report_count == 0 && wb_draft_count == 0 {
        return Err("当前暂无可备份的数据，无需导出备份".to_string());
    }

    let temp_snap = std::env::temp_dir().join(format!("ledger_backup_{}.db", Uuid::new_v4()));
    if temp_snap.exists() {
        let _ = fs::remove_file(&temp_snap);
    }

    let snap_str = temp_snap
        .to_str()
        .ok_or_else(|| "临时备份路径无效".to_string())?;
    conn.execute("VACUUM INTO ?1", params![snap_str])
        .map_err(|e| format!("生成数据库快照失败: {}", e))?;

    // Strip excluded scopes from the snapshot DB so restoring never produces dangling file references.
    if !options.include_workbench
        || !options.include_reports
        || !options.include_photos
        || !options.include_settings
    {
        if let Ok(snap_conn) = Connection::open(&temp_snap) {
            if !options.include_workbench {
                let _ = snap_conn.execute_batch(
                    "DELETE FROM workbench_pdf_drafts; DELETE FROM workbench_pdf_state;",
                );
            }
            if !options.include_reports {
                let _ = snap_conn.execute_batch("DELETE FROM calibration_reports;");
            }
            if !options.include_photos {
                let _ = snap_conn.execute_batch(
                    "UPDATE instruments SET photo_path = '';
                     UPDATE app_settings SET value = '' WHERE key IN ('company_logo_path', 'admin_avatar_path');",
                );
            }
            if !options.include_settings {
                for key in CONFIG_SYNC_SETTING_KEYS {
                    let _ = snap_conn.execute("DELETE FROM app_settings WHERE key = ?1", params![key]);
                }
            }
        }
    }

    if let Some(parent) = dest_zip_path.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("创建目标目录失败: {}", e))?;
    }

    let file = File::create(dest_zip_path).map_err(|e| format!("创建备份压缩包失败: {}", e))?;
    let mut zip = ZipWriter::new(file);
    let opts = SimpleFileOptions::default()
        .compression_method(CompressionMethod::Deflated)
        .unix_permissions(0o644);

    let created_at = now_iso();
    let manifest = BackupManifest {
        app_name: "InstrumentLedger".to_string(),
        app_version: env!("CARGO_PKG_VERSION").to_string(),
        created_at: created_at.clone(),
        instrument_count,
        report_count,
        include_photos: options.include_photos,
        include_reports: options.include_reports,
        include_settings: options.include_settings,
        include_workbench: options.include_workbench,
    };

    let manifest_json =
        serde_json::to_vec_pretty(&manifest).map_err(|e| format!("序列化备份清单失败: {}", e))?;
    zip.start_file("manifest.json", opts)
        .map_err(|e| format!("写入清单失败: {}", e))?;
    zip.write_all(&manifest_json)
        .map_err(|e| format!("写入清单内容失败: {}", e))?;

    // Write database snapshot
    {
        let mut db_bytes = Vec::new();
        File::open(&temp_snap)
            .and_then(|mut f| f.read_to_end(&mut db_bytes))
            .map_err(|e| format!("读取数据库快照失败: {}", e))?;
        zip.start_file("ledger.db", opts)
            .map_err(|e| format!("写入数据库到压缩包失败: {}", e))?;
        zip.write_all(&db_bytes)
            .map_err(|e| format!("写入数据库内容失败: {}", e))?;
    }
    let _ = fs::remove_file(&temp_snap);

    // Write included attachment/cache directories
    let mut folders: Vec<&str> = Vec::with_capacity(3);
    if options.include_photos {
        folders.push("images");
    }
    if options.include_reports {
        folders.push("reports");
    }
    if options.include_workbench {
        folders.push("workbench");
    }
    for folder in folders {
        let root = data_dir.join(folder);
        if !root.exists() {
            continue;
        }
        for entry in WalkDir::new(&root).into_iter().filter_map(|e| e.ok()) {
            if !entry.file_type().is_file() {
                continue;
            }
            let rel = entry
                .path()
                .strip_prefix(data_dir)
                .map_err(|e| format!("路径处理失败: {}", e))?;
            let zip_name = rel.to_string_lossy().replace('\\', "/");
            let mut buf = Vec::new();
            File::open(entry.path())
                .and_then(|mut f| f.read_to_end(&mut buf))
                .map_err(|e| format!("读取附件失败 ({}): {}", zip_name, e))?;
            zip.start_file(&zip_name, opts)
                .map_err(|e| format!("写入附件到压缩包失败: {}", e))?;
            zip.write_all(&buf)
                .map_err(|e| format!("写入附件数据失败: {}", e))?;
        }
    }

    zip.finish()
        .map_err(|e| format!("完成备份压缩包失败: {}", e))?;

    let size_bytes = fs::metadata(dest_zip_path).map(|m| m.len()).unwrap_or(0);

    Ok(BackupResult {
        path: dest_zip_path.to_string_lossy().to_string(),
        size_bytes,
        instrument_count,
        report_count,
        created_at,
    })
}

pub fn restore_backup(
    conn_guard: &mut Connection,
    db_path: &Path,
    data_dir: &Path,
    src_zip_path: &Path,
) -> Result<RestoreResult, String> {
    let file = File::open(src_zip_path).map_err(|e| format!("打开备份文件失败: {}", e))?;
    let mut archive = ZipArchive::new(file).map_err(|e| format!("无效的 ZIP 备份包: {}", e))?;

    let staging = std::env::temp_dir().join(format!("ledger_restore_{}", Uuid::new_v4()));
    fs::create_dir_all(&staging).map_err(|e| format!("创建临时解压目录失败: {}", e))?;

    let extract_res = (|| -> Result<(), String> {
        for i in 0..archive.len() {
            let mut entry = archive
                .by_index(i)
                .map_err(|e| format!("读取备份项失败: {}", e))?;
            let Some(enclosed) = entry.enclosed_name() else {
                continue;
            };
            let out_path = staging.join(enclosed);
            if entry.is_dir() {
                fs::create_dir_all(&out_path).map_err(|e| format!("创建目录失败: {}", e))?;
            } else {
                if let Some(parent) = out_path.parent() {
                    fs::create_dir_all(parent).map_err(|e| format!("创建父目录失败: {}", e))?;
                }
                let mut out_file =
                    File::create(&out_path).map_err(|e| format!("解压文件失败: {}", e))?;
                std::io::copy(&mut entry, &mut out_file)
                    .map_err(|e| format!("写入解压数据失败: {}", e))?;
            }
        }
        Ok(())
    })();

    if let Err(e) = extract_res {
        let _ = fs::remove_dir_all(&staging);
        return Err(e);
    }

    let extracted_db = staging.join("ledger.db");
    if !extracted_db.exists() {
        let _ = fs::remove_dir_all(&staging);
        return Err("备份包中缺少 ledger.db 数据库文件，无法还原".to_string());
    }

    let manifest_opt: Option<BackupManifest> = fs::read(staging.join("manifest.json"))
        .ok()
        .and_then(|b| serde_json::from_slice::<BackupManifest>(&b).ok());
    let preserve_local_settings = manifest_opt
        .as_ref()
        .map(|m| !m.include_settings)
        .unwrap_or(false);
    let preserved_settings: Vec<(String, String)> = if preserve_local_settings {
        CONFIG_SYNC_SETTING_KEYS
            .iter()
            .filter_map(|k| {
                get_setting(conn_guard, k)
                    .ok()
                    .flatten()
                    .map(|v| ((*k).to_string(), v))
            })
            .collect()
    } else {
        Vec::new()
    };

    // Validate SQLite integrity and schema
    let (instrument_count, report_count) = {
        let test_conn = Connection::open(&extracted_db)
            .map_err(|e| format!("备份包中的数据库已损坏: {}", e))?;
        let ic: usize = test_conn
            .query_row("SELECT COUNT(*) FROM instruments", [], |r| r.get(0))
            .map_err(|e| format!("备份包数据表结构不兼容: {}", e))?;
        let rc: usize = test_conn
            .query_row("SELECT COUNT(*) FROM calibration_reports", [], |r| r.get(0))
            .unwrap_or(0);
        (ic, rc)
    };

    // Release active SQLite file handle (crucial on Windows to avoid file-in-use error)
    let mem_conn =
        Connection::open_in_memory().map_err(|e| format!("切换临时内存库失败: {}", e))?;
    *conn_guard = mem_conn;

    // Remove WAL/SHM sidecar files before replacing ledger.db
    let wal_path = db_path.with_extension("db-wal");
    let shm_path = db_path.with_extension("db-shm");
    let _ = fs::remove_file(&wal_path);
    let _ = fs::remove_file(&shm_path);

    if let Err(e) = fs::copy(&extracted_db, db_path) {
        // Attempt to reopen original db
        if let Ok(reopened) = init_db(db_path) {
            *conn_guard = reopened;
        }
        let _ = fs::remove_dir_all(&staging);
        return Err(format!("替换数据库文件失败: {}", e));
    }

    // Replace images/, reports/, and workbench/
    for folder in ["images", "reports", "workbench"] {
        let target_dir = data_dir.join(folder);
        if target_dir.exists() {
            let _ = fs::remove_dir_all(&target_dir);
        }
        fs::create_dir_all(&target_dir).map_err(|e| format!("重建附件目录失败: {}", e))?;

        let src_dir = staging.join(folder);
        if src_dir.exists() {
            copy_dir_recursive(&src_dir, &target_dir)?;
        }
    }
    ensure_storage_dirs(data_dir)?;

    let _ = fs::remove_dir_all(&staging);

    // Reopen restored database
    let new_conn = init_db(db_path)?;
    for (k, v) in preserved_settings {
        let _ = set_setting(&new_conn, &k, &v);
    }
    *conn_guard = new_conn;

    Ok(RestoreResult {
        instrument_count,
        report_count,
        restored_from: src_zip_path.to_string_lossy().to_string(),
    })
}

fn build_unique_reset_backup_path(backup_dir: &Path) -> PathBuf {
    let ts = Local::now().format("%Y%m%d_%H%M%S");
    let base = format!("仪器台账_初始化前自动备份_{}", ts);
    let candidate = backup_dir.join(format!("{}.zip", base));
    if !candidate.exists() {
        return candidate;
    }
    for i in 1..=999 {
        let alt = backup_dir.join(format!("{}_{}.zip", base, i));
        if !alt.exists() {
            return alt;
        }
    }
    backup_dir.join(format!("{}_{}.zip", base, Uuid::new_v4()))
}

/// Conditional mandatory-backup factory reset:
/// 1. When ledger data exists (`instruments` or `calibration_reports` > 0),
///    creates & verifies a complete ZIP backup in `backup_dir` FIRST.
///    If backup fails for any reason, live data is left completely untouched.
///    When no ledger data exists, skips exporting an empty backup file.
/// 2. Releases the SQLite file lock, wipes ledger.db (+ WAL/SHM) and attachments,
///    and initializes a clean uninitialized database ready for first-launch onboarding.
pub fn reset_app_data_with_backup(
    conn_guard: &mut Connection,
    db_path: &Path,
    data_dir: &Path,
    backup_dir: Option<&Path>,
) -> Result<Option<BackupResult>, String> {
    let instrument_count: usize = conn_guard
        .query_row("SELECT COUNT(*) FROM instruments", [], |r| r.get(0))
        .unwrap_or(0);
    let report_count: usize = conn_guard
        .query_row("SELECT COUNT(*) FROM calibration_reports", [], |r| r.get(0))
        .unwrap_or(0);
    let has_data = instrument_count > 0 || report_count > 0;

    let include_workbench = get_backup_include_workbench(conn_guard);
    let backup_res = if has_data {
        let dir = backup_dir.ok_or_else(|| "未指定备份保存目录".to_string())?;
        fs::create_dir_all(dir)
            .map_err(|e| format!("无法访问或创建备份目录 ({}): {}", dir.display(), e))?;

        let dest_zip = build_unique_reset_backup_path(dir);
        let res = create_backup_with_options(conn_guard, data_dir, &dest_zip, include_workbench)?;

        if !dest_zip.exists() || res.size_bytes == 0 {
            return Err("强制备份校验失败（备份文件为空），已中止初始化操作".to_string());
        }
        Some(res)
    } else {
        None
    };

    // Release active SQLite file handle cleanly (essential on Windows)
    let mem_conn =
        Connection::open_in_memory().map_err(|e| format!("切换临时内存库失败: {}", e))?;
    *conn_guard = mem_conn;

    // Remove database & WAL/SHM sidecar files
    let wal_path = db_path.with_extension("db-wal");
    let shm_path = db_path.with_extension("db-shm");
    let _ = fs::remove_file(&wal_path);
    let _ = fs::remove_file(&shm_path);
    if db_path.exists() {
        fs::remove_file(db_path).map_err(|e| {
            if let Ok(reopened) = init_db(db_path) {
                *conn_guard = reopened;
            }
            if let Some(ref bak) = backup_res {
                format!("清理旧数据库文件失败（备份已保存至 {}）: {}", bak.path, e)
            } else {
                format!("清理旧数据库文件失败: {}", e)
            }
        })?;
    }

    // Wipe and recreate attachment & workbench cache folders, plus local sync config
    for folder in ["images", "reports", "workbench", "sync_backups"] {
        let dir = data_dir.join(folder);
        if dir.exists() {
            let _ = fs::remove_dir_all(&dir);
        }
        if folder != "sync_backups" {
            fs::create_dir_all(&dir).map_err(|e| format!("重建附件目录失败: {}", e))?;
        }
    }
    crate::sync_engine::remove_sync_config_file(data_dir);
    ensure_storage_dirs(data_dir)?;

    // Re-initialize brand new empty database (account_initialized unset)
    let fresh_conn = init_db(db_path)?;
    *conn_guard = fresh_conn;

    Ok(backup_res)
}

fn copy_dir_recursive(src: &Path, dst: &Path) -> Result<(), String> {
    for entry in WalkDir::new(src).into_iter().filter_map(|e| e.ok()) {
        let rel = entry
            .path()
            .strip_prefix(src)
            .map_err(|e| format!("路径错误: {}", e))?;
        if rel.as_os_str().is_empty() {
            continue;
        }
        let target = dst.join(rel);
        if entry.file_type().is_dir() {
            fs::create_dir_all(&target).map_err(|e| format!("创建目录失败: {}", e))?;
        } else if entry.file_type().is_file() {
            if let Some(parent) = target.parent() {
                fs::create_dir_all(parent).map_err(|e| format!("创建父目录失败: {}", e))?;
            }
            fs::copy(entry.path(), &target).map_err(|e| format!("恢复附件失败: {}", e))?;
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_backup_and_restore_roundtrip() {
        let root = std::env::temp_dir().join(format!("inst_ledger_test_{}", Uuid::new_v4()));
        let data_dir = root.join("data");
        let db_path = data_dir.join("ledger.db");
        let zip_path = root.join("backup.zip");

        ensure_storage_dirs(&data_dir).unwrap();
        let mut conn = init_db(&db_path).unwrap();

        conn.execute(
            "INSERT INTO instruments (category, seq_no, department, name, serial_no, created_at, updated_at)
             VALUES ('gauge', 1, '品质部', 'UV能量计', '128004369', '2026-11-25', '2026-11-25')",
            [],
        )
        .unwrap();
        fs::write(data_dir.join("images").join("loc.png"), b"fake-png-bytes").unwrap();
        fs::create_dir_all(data_dir.join("reports").join("1")).unwrap();
        fs::write(data_dir.join("reports").join("1").join("cert.pdf"), b"%PDF-1.4").unwrap();

        let bak = create_backup(&conn, &data_dir, &zip_path).expect("backup failed");
        assert_eq!(bak.instrument_count, 1);
        assert!(bak.size_bytes > 0);

        // Mutate live state to simulate data loss
        conn.execute("DELETE FROM instruments", []).unwrap();
        let _ = fs::remove_file(data_dir.join("images").join("loc.png"));

        let res = restore_backup(&mut conn, &db_path, &data_dir, &zip_path).expect("restore failed");
        assert_eq!(res.instrument_count, 1);
        let count: i64 = conn
            .query_row("SELECT COUNT(*) FROM instruments", [], |r| r.get(0))
            .unwrap();
        assert_eq!(count, 1);
        assert_eq!(
            fs::read(data_dir.join("images").join("loc.png")).unwrap(),
            b"fake-png-bytes"
        );
        assert_eq!(
            fs::read(data_dir.join("reports").join("1").join("cert.pdf")).unwrap(),
            b"%PDF-1.4"
        );

        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn test_reset_app_data_with_backup_and_restore() {
        use crate::db::{is_account_initialized, set_setting};

        let root = std::env::temp_dir().join(format!("inst_reset_test_{}", Uuid::new_v4()));
        let data_dir = root.join("data");
        let downloads_dir = root.join("Downloads");
        let db_path = data_dir.join("ledger.db");

        ensure_storage_dirs(&data_dir).unwrap();
        let mut conn = init_db(&db_path).unwrap();

        set_setting(&conn, "admin_username", "qa_admin").unwrap();
        set_setting(&conn, "admin_password_hash", "dummy_hash").unwrap();
        set_setting(&conn, "account_initialized", "1").unwrap();
        conn.execute(
            "INSERT INTO instruments (category, seq_no, department, name, serial_no, created_at, updated_at)
             VALUES ('gauge', 1, '品质部', '数显卡尺', 'DCJ-01', '2026-11-25', '2026-11-25')",
            [],
        )
        .unwrap();
        fs::write(data_dir.join("images").join("photo.png"), b"img-data").unwrap();

        let bak = reset_app_data_with_backup(&mut conn, &db_path, &data_dir, Some(&downloads_dir))
            .expect("reset with backup failed")
            .expect("expected backup when data exists");

        assert!(Path::new(&bak.path).exists());
        assert!(bak.path.starts_with(downloads_dir.to_string_lossy().as_ref()));
        assert_eq!(bak.instrument_count, 1);
        assert!(bak.size_bytes > 0);

        // Live database must be freshly uninitialized & empty
        assert!(!is_account_initialized(&conn).unwrap());
        let count: i64 = conn
            .query_row("SELECT COUNT(*) FROM instruments", [], |r| r.get(0))
            .unwrap();
        assert_eq!(count, 0);
        assert!(!data_dir.join("images").join("photo.png").exists());

        // Restoring from the mandatory backup brings everything back
        let res = restore_backup(&mut conn, &db_path, &data_dir, Path::new(&bak.path))
            .expect("restore after reset failed");
        assert_eq!(res.instrument_count, 1);
        assert!(is_account_initialized(&conn).unwrap());
        assert_eq!(
            fs::read(data_dir.join("images").join("photo.png")).unwrap(),
            b"img-data"
        );

        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn test_reset_app_data_skips_backup_when_empty() {
        use crate::db::{is_account_initialized, set_setting};

        let root = std::env::temp_dir().join(format!("inst_reset_empty_{}", Uuid::new_v4()));
        let data_dir = root.join("data");
        let downloads_dir = root.join("Downloads");
        let db_path = data_dir.join("ledger.db");

        ensure_storage_dirs(&data_dir).unwrap();
        let mut conn = init_db(&db_path).unwrap();

        set_setting(&conn, "admin_username", "qa_admin").unwrap();
        set_setting(&conn, "admin_password_hash", "dummy_hash").unwrap();
        set_setting(&conn, "account_initialized", "1").unwrap();

        let empty_zip = root.join("empty.zip");
        assert!(create_backup(&conn, &data_dir, &empty_zip).is_err());
        assert!(!empty_zip.exists());

        let bak = reset_app_data_with_backup(&mut conn, &db_path, &data_dir, Some(&downloads_dir))
            .expect("reset without data failed");

        assert!(bak.is_none());
        assert!(!downloads_dir.exists());
        assert!(!is_account_initialized(&conn).unwrap());

        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn test_backup_workbench_toggle_include_and_exclude() {
        use crate::workbench_store::{
            read_pdf_draft_meta, save_pdf_source, SavePdfSourceMeta,
        };

        let root = std::env::temp_dir().join(format!("inst_wb_bak_test_{}", Uuid::new_v4()));
        let data_dir = root.join("data");
        let db_path = data_dir.join("ledger.db");
        let zip_excl = root.join("excl.zip");
        let zip_incl = root.join("incl.zip");

        ensure_storage_dirs(&data_dir).unwrap();
        let mut conn = init_db(&db_path).unwrap();
        conn.execute(
            "INSERT INTO instruments (category, seq_no, department, name, serial_no, created_at, updated_at)
             VALUES ('gauge', 1, '品质部', '卡尺', 'C-01', '2026-11-28', '2026-11-28')",
            [],
        )
        .unwrap();

        save_pdf_source(
            &conn,
            &data_dir,
            &SavePdfSourceMeta {
                id: "deadbeef01".to_string(),
                name: "drawing-1".to_string(),
                page_count: 1,
                marker_count: 2,
                markers_json: "[1,2]".to_string(),
                view_json: None,
                next_number: 3,
                compatibility: false,
                updated_at: 1000,
            },
            Some(b"%PDF-1.7-SAMPLE"),
        )
        .unwrap();

        // 1. Exclude workbench -> backup restores cleanly with 0 workbench drafts and no dangling refs
        create_backup_with_options(&conn, &data_dir, &zip_excl, false).unwrap();
        // 2. Include workbench -> backup restores both ledger & workbench draft
        create_backup_with_options(&conn, &data_dir, &zip_incl, true).unwrap();

        restore_backup(&mut conn, &db_path, &data_dir, &zip_excl).unwrap();
        assert!(read_pdf_draft_meta(&conn, &data_dir, "deadbeef01").unwrap().is_none());

        restore_backup(&mut conn, &db_path, &data_dir, &zip_incl).unwrap();
        let restored = read_pdf_draft_meta(&conn, &data_dir, "deadbeef01").unwrap();
        assert!(restored.is_some());
        assert_eq!(restored.unwrap().name, "drawing-1");

        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn test_backup_scope_options_exclude_photos_reports_and_settings() {
        use crate::db::{get_setting, set_setting};

        let root = std::env::temp_dir().join(format!("inst_scope_bak_test_{}", Uuid::new_v4()));
        let data_dir = root.join("data");
        let db_path = data_dir.join("ledger.db");
        let zip_lite = root.join("lite.zip");

        ensure_storage_dirs(&data_dir).unwrap();
        let mut conn = init_db(&db_path).unwrap();
        set_setting(&conn, "doc_title", "原始标题").unwrap();
        fs::write(data_dir.join("images").join("p1.png"), b"img").unwrap();
        fs::create_dir_all(data_dir.join("reports").join("1")).unwrap();
        fs::write(data_dir.join("reports").join("1").join("r1.pdf"), b"pdf").unwrap();
        conn.execute(
            "INSERT INTO instruments (category, seq_no, department, name, serial_no, photo_path, created_at, updated_at)
             VALUES ('gauge', 1, '品质部', '卡尺', 'C-01', 'images/p1.png', '2026-11-28', '2026-11-28')",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO calibration_reports (instrument_id, file_name, stored_path, file_ext, file_size, cal_date, cal_agency, remark, uploaded_at)
             VALUES (1, 'r1.pdf', 'reports/1/r1.pdf', 'pdf', 3, '2026-11-28', '机构', '', '2026-11-28')",
            [],
        )
        .unwrap();

        let bak = create_backup_with_scope(
            &conn,
            &data_dir,
            &zip_lite,
            BackupScopeOptions {
                include_photos: false,
                include_reports: false,
                include_settings: false,
                include_workbench: false,
            },
        )
        .unwrap();
        assert_eq!(bak.instrument_count, 1);
        assert_eq!(bak.report_count, 0);

        // Mutate local title before restoring the settings-excluded backup
        set_setting(&conn, "doc_title", "保留本机标题").unwrap();
        let res = restore_backup(&mut conn, &db_path, &data_dir, &zip_lite).unwrap();
        assert_eq!(res.instrument_count, 1);
        assert_eq!(res.report_count, 0);
        assert_eq!(
            get_setting(&conn, "doc_title").unwrap().as_deref(),
            Some("保留本机标题")
        );
        let photo_path: String = conn
            .query_row("SELECT photo_path FROM instruments WHERE id = 1", [], |r| r.get(0))
            .unwrap();
        assert!(photo_path.is_empty());
        assert!(!data_dir.join("images").join("p1.png").exists());
        assert!(!data_dir.join("reports").join("1").join("r1.pdf").exists());

        let _ = fs::remove_dir_all(&root);
    }
}
