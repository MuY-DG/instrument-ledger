use std::path::Path;

use chrono::{Duration, Months, NaiveDate, Utc};
use rusqlite::{params, Connection, OptionalExtension};

use crate::auth::verify_password;
use crate::models::{AppSettings, CalibrationReport, Instrument};

pub fn now_iso() -> String {
    Utc::now().to_rfc3339()
}

/// Calculate next calibration date using standard metrology rule:
/// last_cal_date + cal_cycle_months - 1 day (e.g., 2026-06-18 + 12 months => 2027-06-17)
pub fn calc_next_cal_date(last_date: &str, months: i64) -> String {
    let trimmed = last_date.trim();
    if trimmed.is_empty() || months <= 0 {
        return String::new();
    }
    let Ok(date) = NaiveDate::parse_from_str(trimmed, "%Y-%m-%d") else {
        return String::new();
    };
    let Some(added) = date.checked_add_months(Months::new(months as u32)) else {
        return String::new();
    };
    let next = added - Duration::days(1);
    next.format("%Y-%m-%d").to_string()
}

pub fn init_db(db_path: &Path) -> Result<Connection, String> {
    if let Some(parent) = db_path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| format!("创建数据目录失败: {}", e))?;
    }

    let conn = Connection::open(db_path).map_err(|e| format!("打开数据库失败: {}", e))?;
    conn.execute_batch(
        "
        PRAGMA journal_mode = WAL;
        PRAGMA foreign_keys = ON;
        PRAGMA synchronous = NORMAL;

        CREATE TABLE IF NOT EXISTS instruments (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            category TEXT NOT NULL DEFAULT 'gauge',
            seq_no INTEGER NOT NULL DEFAULT 0,
            department TEXT NOT NULL DEFAULT '',
            name TEXT NOT NULL,
            purchase_date TEXT NOT NULL DEFAULT '',
            serial_no TEXT NOT NULL DEFAULT '',
            model_spec TEXT NOT NULL DEFAULT '',
            location TEXT NOT NULL DEFAULT '',
            calibration_type TEXT NOT NULL DEFAULT 'external',
            record_type TEXT NOT NULL DEFAULT '校准报告',
            last_cal_date TEXT NOT NULL DEFAULT '',
            cal_cycle_months INTEGER NOT NULL DEFAULT 12,
            next_cal_date TEXT NOT NULL DEFAULT '',
            exempt_calibration INTEGER NOT NULL DEFAULT 0,
            remark TEXT NOT NULL DEFAULT '',
            supplier TEXT NOT NULL DEFAULT '',
            contact_person TEXT NOT NULL DEFAULT '',
            contact_phone TEXT NOT NULL DEFAULT '',
            cal_agency TEXT NOT NULL DEFAULT '',
            photo_path TEXT NOT NULL DEFAULT '',
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_instruments_category ON instruments(category);
        CREATE INDEX IF NOT EXISTS idx_instruments_serial_no ON instruments(serial_no);
        CREATE INDEX IF NOT EXISTS idx_instruments_next_cal ON instruments(next_cal_date);

        CREATE TABLE IF NOT EXISTS calibration_reports (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            instrument_id INTEGER NOT NULL,
            file_name TEXT NOT NULL,
            stored_path TEXT NOT NULL,
            file_ext TEXT NOT NULL DEFAULT '',
            file_size INTEGER NOT NULL DEFAULT 0,
            cal_date TEXT NOT NULL DEFAULT '',
            cal_agency TEXT NOT NULL DEFAULT '',
            remark TEXT NOT NULL DEFAULT '',
            uploaded_at TEXT NOT NULL,
            FOREIGN KEY (instrument_id) REFERENCES instruments(id) ON DELETE CASCADE
        );

        CREATE INDEX IF NOT EXISTS idx_reports_instrument_id ON calibration_reports(instrument_id);

        CREATE TABLE IF NOT EXISTS app_settings (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        );
        ",
    )
    .map_err(|e| format!("初始化数据表失败: {}", e))?;

    seed_default_settings(&conn)?;
    migrate_auth_state(&conn)?;
    Ok(conn)
}

pub const DEFAULT_GITHUB_REPO: &str = "MuY-DG/instrument-ledger";
pub const DEFAULT_UPDATE_PROXY_URL: &str = "https://gh-proxy.com/";

fn seed_default_settings(conn: &Connection) -> Result<(), String> {
    let defaults = [
        ("warning_days", "30"),
        ("auto_lock_minutes", "0"),
        ("doc_code", "JSSK-MPR-170"),
        ("doc_version", "A"),
        ("doc_title", "监视与测量管理台账"),
        (
            "doc_subtitle",
            "The management record and plan of monitoring and measuring equipment",
        ),
        (
            "weekly_notice",
            "定期核查监视与测量设备校准有效期，确保量值溯源准确可靠",
        ),
        ("github_repo", DEFAULT_GITHUB_REPO),
        ("update_proxy_url", DEFAULT_UPDATE_PROXY_URL),
        ("company_logo_path", ""),
    ];

    for (key, value) in defaults {
        conn.execute(
            "INSERT OR IGNORE INTO app_settings (key, value) VALUES (?1, ?2)",
            params![key, value],
        )
        .map_err(|e| format!("写入默认配置失败: {}", e))?;
    }
    Ok(())
}

/// Ensures no legacy default `admin/admin123` account persists while preserving
/// any genuinely user-initialized admin credentials from earlier versions.
fn migrate_auth_state(conn: &Connection) -> Result<(), String> {
    if get_setting(conn, "account_initialized")?.as_deref() == Some("1") {
        return Ok(());
    }

    let existing_user = get_setting(conn, "admin_username")?.unwrap_or_default();
    let existing_hash = get_setting(conn, "admin_password_hash")?.unwrap_or_default();
    let must_change = get_setting(conn, "must_change_password")?.unwrap_or_default();

    if existing_hash.trim().is_empty() || existing_user.trim().is_empty() {
        return Ok(());
    }

    let is_legacy_default = existing_user.trim() == "admin"
        && must_change == "1"
        && verify_password("admin123", &existing_hash);

    if is_legacy_default {
        conn.execute(
            "DELETE FROM app_settings WHERE key IN ('admin_username', 'admin_password_hash', 'must_change_password', 'account_initialized')",
            [],
        )
        .map_err(|e| format!("清理遗留默认账号失败: {}", e))?;
    } else {
        set_setting(conn, "account_initialized", "1")?;
        set_setting(conn, "must_change_password", "0")?;
    }
    Ok(())
}

pub fn is_account_initialized(conn: &Connection) -> Result<bool, String> {
    let flag = get_setting(conn, "account_initialized")?.unwrap_or_default();
    let user = get_setting(conn, "admin_username")?.unwrap_or_default();
    let hash = get_setting(conn, "admin_password_hash")?.unwrap_or_default();
    Ok(flag == "1" && !user.trim().is_empty() && !hash.trim().is_empty())
}

pub fn get_setting(conn: &Connection, key: &str) -> Result<Option<String>, String> {
    conn.query_row(
        "SELECT value FROM app_settings WHERE key = ?1",
        params![key],
        |row| row.get(0),
    )
    .optional()
    .map_err(|e| format!("读取配置失败: {}", e))
}

pub fn set_setting(conn: &Connection, key: &str, value: &str) -> Result<(), String> {
    conn.execute(
        "INSERT INTO app_settings (key, value) VALUES (?1, ?2)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        params![key, value],
    )
    .map_err(|e| format!("保存配置失败: {}", e))?;
    Ok(())
}

pub fn load_app_settings(conn: &Connection) -> Result<AppSettings, String> {
    let get_or = |k: &str, d: &str| -> String {
        get_setting(conn, k)
            .ok()
            .flatten()
            .unwrap_or_else(|| d.to_string())
    };
    Ok(AppSettings {
        admin_username: get_or("admin_username", ""),
        warning_days: get_or("warning_days", "30").parse().unwrap_or(30),
        auto_lock_minutes: get_or("auto_lock_minutes", "0").parse().unwrap_or(0),
        doc_code: get_or("doc_code", "JSSK-MPR-170"),
        doc_version: get_or("doc_version", "A"),
        doc_title: get_or("doc_title", "监视与测量管理台账"),
        doc_subtitle: get_or(
            "doc_subtitle",
            "The management record and plan of monitoring and measuring equipment",
        ),
        weekly_notice: get_or(
            "weekly_notice",
            "定期核查监视与测量设备校准有效期，确保量值溯源准确可靠",
        ),
        github_repo: get_or("github_repo", DEFAULT_GITHUB_REPO),
        update_proxy_url: get_or("update_proxy_url", DEFAULT_UPDATE_PROXY_URL),
        company_logo_path: get_or("company_logo_path", ""),
    })
}

pub fn query_instruments(conn: &Connection) -> Result<Vec<Instrument>, String> {
    let sql = "
        SELECT
            i.id, i.category, i.seq_no, i.department, i.name, i.purchase_date,
            i.serial_no, i.model_spec, i.location, i.calibration_type, i.record_type,
            i.last_cal_date, i.cal_cycle_months, i.next_cal_date, i.exempt_calibration,
            i.remark, i.supplier, i.contact_person, i.contact_phone, i.cal_agency,
            i.photo_path, i.created_at, i.updated_at,
            (SELECT COUNT(*) FROM calibration_reports r WHERE r.instrument_id = i.id) AS report_count,
            (SELECT r.id FROM calibration_reports r WHERE r.instrument_id = i.id ORDER BY r.cal_date DESC, r.uploaded_at DESC, r.id DESC LIMIT 1) AS latest_report_id,
            (SELECT r.file_name FROM calibration_reports r WHERE r.instrument_id = i.id ORDER BY r.cal_date DESC, r.uploaded_at DESC, r.id DESC LIMIT 1) AS latest_report_name,
            (SELECT r.file_ext FROM calibration_reports r WHERE r.instrument_id = i.id ORDER BY r.cal_date DESC, r.uploaded_at DESC, r.id DESC LIMIT 1) AS latest_report_ext
        FROM instruments i
        ORDER BY i.category ASC, CASE WHEN i.seq_no > 0 THEN i.seq_no ELSE 999999 END ASC, i.id ASC
    ";

    let mut stmt = conn.prepare(sql).map_err(|e| format!("查询失败: {}", e))?;
    let rows = stmt
        .query_map([], |row| {
            let exempt_int: i64 = row.get(14)?;
            Ok(Instrument {
                id: row.get(0)?,
                category: row.get(1)?,
                seq_no: row.get(2)?,
                department: row.get(3)?,
                name: row.get(4)?,
                purchase_date: row.get(5)?,
                serial_no: row.get(6)?,
                model_spec: row.get(7)?,
                location: row.get(8)?,
                calibration_type: row.get(9)?,
                record_type: row.get(10)?,
                last_cal_date: row.get(11)?,
                cal_cycle_months: row.get(12)?,
                next_cal_date: row.get(13)?,
                exempt_calibration: exempt_int != 0,
                remark: row.get(15)?,
                supplier: row.get(16)?,
                contact_person: row.get(17)?,
                contact_phone: row.get(18)?,
                cal_agency: row.get(19)?,
                photo_path: row.get(20)?,
                created_at: row.get(21)?,
                updated_at: row.get(22)?,
                report_count: row.get(23)?,
                latest_report_id: row.get(24)?,
                latest_report_name: row.get(25)?,
                latest_report_ext: row.get(26)?,
            })
        })
        .map_err(|e| format!("解析数据失败: {}", e))?;

    let mut result = Vec::new();
    for item in rows {
        result.push(item.map_err(|e| format!("读取记录失败: {}", e))?);
    }
    Ok(result)
}

pub fn query_instrument_by_id(conn: &Connection, id: i64) -> Result<Instrument, String> {
    let sql = "
        SELECT
            i.id, i.category, i.seq_no, i.department, i.name, i.purchase_date,
            i.serial_no, i.model_spec, i.location, i.calibration_type, i.record_type,
            i.last_cal_date, i.cal_cycle_months, i.next_cal_date, i.exempt_calibration,
            i.remark, i.supplier, i.contact_person, i.contact_phone, i.cal_agency,
            i.photo_path, i.created_at, i.updated_at,
            (SELECT COUNT(*) FROM calibration_reports r WHERE r.instrument_id = i.id) AS report_count,
            (SELECT r.id FROM calibration_reports r WHERE r.instrument_id = i.id ORDER BY r.cal_date DESC, r.uploaded_at DESC, r.id DESC LIMIT 1) AS latest_report_id,
            (SELECT r.file_name FROM calibration_reports r WHERE r.instrument_id = i.id ORDER BY r.cal_date DESC, r.uploaded_at DESC, r.id DESC LIMIT 1) AS latest_report_name,
            (SELECT r.file_ext FROM calibration_reports r WHERE r.instrument_id = i.id ORDER BY r.cal_date DESC, r.uploaded_at DESC, r.id DESC LIMIT 1) AS latest_report_ext
        FROM instruments i
        WHERE i.id = ?1
    ";
    conn.query_row(sql, params![id], |row| {
        let exempt_int: i64 = row.get(14)?;
        Ok(Instrument {
            id: row.get(0)?,
            category: row.get(1)?,
            seq_no: row.get(2)?,
            department: row.get(3)?,
            name: row.get(4)?,
            purchase_date: row.get(5)?,
            serial_no: row.get(6)?,
            model_spec: row.get(7)?,
            location: row.get(8)?,
            calibration_type: row.get(9)?,
            record_type: row.get(10)?,
            last_cal_date: row.get(11)?,
            cal_cycle_months: row.get(12)?,
            next_cal_date: row.get(13)?,
            exempt_calibration: exempt_int != 0,
            remark: row.get(15)?,
            supplier: row.get(16)?,
            contact_person: row.get(17)?,
            contact_phone: row.get(18)?,
            cal_agency: row.get(19)?,
            photo_path: row.get(20)?,
            created_at: row.get(21)?,
            updated_at: row.get(22)?,
            report_count: row.get(23)?,
            latest_report_id: row.get(24)?,
            latest_report_name: row.get(25)?,
            latest_report_ext: row.get(26)?,
        })
    })
    .map_err(|e| format!("未找到仪器记录: {}", e))
}

pub fn query_reports_for_instrument(
    conn: &Connection,
    instrument_id: i64,
) -> Result<Vec<CalibrationReport>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT id, instrument_id, file_name, stored_path, file_ext, file_size,
                    cal_date, cal_agency, remark, uploaded_at
             FROM calibration_reports
             WHERE instrument_id = ?1
             ORDER BY cal_date DESC, uploaded_at DESC, id DESC",
        )
        .map_err(|e| format!("查询校验报告失败: {}", e))?;

    let rows = stmt
        .query_map(params![instrument_id], |row| {
            Ok(CalibrationReport {
                id: row.get(0)?,
                instrument_id: row.get(1)?,
                file_name: row.get(2)?,
                stored_path: row.get(3)?,
                file_ext: row.get(4)?,
                file_size: row.get(5)?,
                cal_date: row.get(6)?,
                cal_agency: row.get(7)?,
                remark: row.get(8)?,
                uploaded_at: row.get(9)?,
            })
        })
        .map_err(|e| format!("读取报告列表失败: {}", e))?;

    let mut out = Vec::new();
    for r in rows {
        out.push(r.map_err(|e| format!("解析报告记录失败: {}", e))?);
    }
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_calc_next_cal_date_jssk_rules() {
        assert_eq!(calc_next_cal_date("2026-06-18", 12), "2027-06-17");
        assert_eq!(calc_next_cal_date("2026-03-19", 12), "2027-03-18");
        assert_eq!(calc_next_cal_date("2025-12-25", 12), "2026-12-24");
        assert_eq!(calc_next_cal_date("2026-01-31", 1), "2026-02-27");
        assert_eq!(calc_next_cal_date("", 12), "");
        assert_eq!(calc_next_cal_date("2026-06-18", 0), "");
    }

    #[test]
    fn test_no_default_account_and_legacy_cleanup() {
        use crate::auth::hash_password;
        let root = std::env::temp_dir().join(format!("inst_auth_test_{}", uuid::Uuid::new_v4()));
        let db_path = root.join("ledger.db");

        // 1. Fresh DB must NOT have any default account
        let conn = init_db(&db_path).expect("init_db failed");
        assert!(!is_account_initialized(&conn).unwrap());
        assert_eq!(get_setting(&conn, "admin_username").unwrap(), None);

        // 2. Simulate untouched legacy default admin/admin123 -> cleared on reopen
        let default_hash = hash_password("admin123").unwrap();
        set_setting(&conn, "admin_username", "admin").unwrap();
        set_setting(&conn, "admin_password_hash", &default_hash).unwrap();
        set_setting(&conn, "must_change_password", "1").unwrap();
        drop(conn);

        let conn2 = init_db(&db_path).expect("reopen failed");
        assert!(!is_account_initialized(&conn2).unwrap());
        assert_eq!(get_setting(&conn2, "admin_username").unwrap(), None);

        // 3. Real custom account must persist across reopens
        let custom_hash = hash_password("MySecurePass#99").unwrap();
        set_setting(&conn2, "admin_username", "qa_lead").unwrap();
        set_setting(&conn2, "admin_password_hash", &custom_hash).unwrap();
        set_setting(&conn2, "account_initialized", "1").unwrap();
        drop(conn2);

        let conn3 = init_db(&db_path).expect("reopen 3 failed");
        assert!(is_account_initialized(&conn3).unwrap());
        assert_eq!(
            get_setting(&conn3, "admin_username").unwrap().as_deref(),
            Some("qa_lead")
        );

        let _ = std::fs::remove_dir_all(&root);
    }

    #[test]
    fn test_default_update_settings_and_override() {
        let root = std::env::temp_dir().join(format!("inst_upd_test_{}", uuid::Uuid::new_v4()));
        let db_path = root.join("ledger.db");

        // Fresh DB seeds default GitHub repo and download proxy
        let conn = init_db(&db_path).expect("init_db failed");
        let s1 = load_app_settings(&conn).unwrap();
        assert_eq!(s1.github_repo, DEFAULT_GITHUB_REPO);
        assert_eq!(s1.update_proxy_url, DEFAULT_UPDATE_PROXY_URL);

        // Explicitly clearing proxy or changing repo must persist across reopen
        set_setting(&conn, "github_repo", "other/repo").unwrap();
        set_setting(&conn, "update_proxy_url", "").unwrap();
        drop(conn);

        let conn2 = init_db(&db_path).expect("reopen failed");
        let s2 = load_app_settings(&conn2).unwrap();
        assert_eq!(s2.github_repo, "other/repo");
        assert_eq!(s2.update_proxy_url, "");

        let _ = std::fs::remove_dir_all(&root);
    }
}
