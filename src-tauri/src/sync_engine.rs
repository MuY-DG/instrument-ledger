use std::collections::{HashMap, HashSet};
use std::fs;
use std::path::{Path, PathBuf};

use chrono::Local;
use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter};
use uuid::Uuid;
use walkdir::WalkDir;

use crate::backup::create_backup_with_options;
use crate::db::{init_db, now_iso, set_setting};
use crate::models::{
    SaveSyncConfigInput, SyncActionResult, SyncConfigView, SyncProgressEvent, SyncStatusResult,
    SyncTestResult, TestSyncConfigInput,
};
use crate::s3_client::{normalize_prefix, S3Client, S3Credentials, S3PutError};
use crate::storage::{ensure_storage_dirs, resolve_sync_blob_path};
use crate::sync_crypto::{
    create_key_verifier, decode_b64, decrypt_bytes, derive_e2ee_key, encode_b64, encrypt_bytes,
    generate_random_salt, gzip_compress, gzip_decompress, salt_id_from_bytes, sha256_hex,
    verify_key_with_verifier, E2EE_ALGORITHM,
};

const SYNC_CONFIG_FILENAME: &str = "sync_config.json";
const MANIFEST_KEY: &str = "manifest.json";
const MAX_RECENT_DB_SNAPSHOTS: usize = 3;
const MAX_SAFETY_BACKUPS: usize = 5;

/// Device-local `app_settings` keys that MUST NEVER be synced to cloud and MUST be preserved locally on Pull.
pub const LOCAL_ONLY_SETTING_KEYS: &[&str] = &[
    "admin_session_active",
    "admin_session_expires_at",
    "keep_admin_session",
    "admin_session_days",
    "app_lock_active",
    "app_lock_enabled",
    "app_lock_pin_hash",
    "app_lock_pin_length",
    "auto_lock_minutes",
    "lock_on_hide",
    "lock_on_startup",
    "close_behavior",
    "github_repo",
    "update_proxy_url",
    "workbench_cache_limit_mb",
    "backup_include_photos",
    "backup_include_reports",
    "backup_include_settings",
    "backup_include_workbench",
];

/// Header, document metadata, and expiry alert preference keys controlled by the
/// "表头与预警配置" content toggle in both Cloud Sync and Local Backup.
pub const CONFIG_SYNC_SETTING_KEYS: &[&str] = &[
    "doc_code",
    "doc_version",
    "doc_title",
    "doc_subtitle",
    "weekly_notice",
    "warning_days",
    "warning_thresholds",
    "alert_popup_enabled",
    "alert_popup_frequency",
    "alert_popup_interval_hours",
];

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct SyncScope {
    pub include_photos: bool,
    pub include_reports: bool,
    pub include_settings: bool,
    pub include_workbench: bool,
}

impl Default for SyncScope {
    fn default() -> Self {
        Self {
            include_photos: true,
            include_reports: true,
            include_settings: true,
            include_workbench: false,
        }
    }
}

impl SyncScope {
    pub fn intersect(self, other: Self) -> Self {
        Self {
            include_photos: self.include_photos && other.include_photos,
            include_reports: self.include_reports && other.include_reports,
            include_settings: self.include_settings && other.include_settings,
            include_workbench: self.include_workbench && other.include_workbench,
        }
    }

    pub fn allows_blob_rel_path(self, rel_path: &str) -> bool {
        let first = rel_path.trim().split('/').next().unwrap_or("");
        match first {
            "images" => self.include_photos,
            "reports" => self.include_reports,
            "workbench" => self.include_workbench,
            _ => false,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncConfigStored {
    #[serde(default)]
    pub enabled: bool,
    #[serde(default = "default_provider_preset")]
    pub provider_preset: String,
    #[serde(default)]
    pub endpoint: String,
    #[serde(default = "default_region")]
    pub region: String,
    #[serde(default)]
    pub bucket: String,
    #[serde(default = "default_prefix")]
    pub prefix: String,
    #[serde(default)]
    pub access_key_id: String,
    #[serde(default)]
    pub secret_access_key: String,
    #[serde(default = "default_true")]
    pub force_path_style: bool,
    #[serde(default)]
    pub e2ee_enabled: bool,
    #[serde(default)]
    pub e2ee_passphrase: String,
    #[serde(default = "default_true")]
    pub check_on_startup: bool,
    #[serde(default = "default_true")]
    pub sync_include_photos: bool,
    #[serde(default = "default_true")]
    pub sync_include_reports: bool,
    #[serde(default = "default_true")]
    pub sync_include_settings: bool,
    #[serde(default)]
    pub sync_include_workbench: bool,
    #[serde(default = "generate_device_id")]
    pub device_id: String,
    #[serde(default = "detect_default_device_name")]
    pub device_name: String,
    #[serde(default)]
    pub last_synced_rev: u64,
    #[serde(default)]
    pub last_synced_db_hash: String,
    #[serde(default)]
    pub last_synced_at: String,
}

fn default_provider_preset() -> String {
    "r2".to_string()
}

fn default_region() -> String {
    "auto".to_string()
}

fn default_prefix() -> String {
    "instrument-ledger".to_string()
}

fn default_true() -> bool {
    true
}

fn generate_device_id() -> String {
    Uuid::new_v4().to_string()
}

fn detect_default_device_name() -> String {
    for var in ["COMPUTERNAME", "HOSTNAME"] {
        if let Ok(val) = std::env::var(var) {
            let trimmed = val.trim();
            if !trimmed.is_empty() {
                return trimmed.chars().take(48).collect();
            }
        }
    }
    #[cfg(target_os = "macos")]
    {
        "macOS 电脑".to_string()
    }
    #[cfg(target_os = "windows")]
    {
        "Windows 电脑".to_string()
    }
    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    {
        "桌面设备".to_string()
    }
}

impl Default for SyncConfigStored {
    fn default() -> Self {
        Self {
            enabled: false,
            provider_preset: default_provider_preset(),
            endpoint: String::new(),
            region: default_region(),
            bucket: String::new(),
            prefix: default_prefix(),
            access_key_id: String::new(),
            secret_access_key: String::new(),
            force_path_style: true,
            e2ee_enabled: false,
            e2ee_passphrase: String::new(),
            check_on_startup: true,
            sync_include_photos: true,
            sync_include_reports: true,
            sync_include_settings: true,
            sync_include_workbench: false,
            device_id: generate_device_id(),
            device_name: detect_default_device_name(),
            last_synced_rev: 0,
            last_synced_db_hash: String::new(),
            last_synced_at: String::new(),
        }
    }
}

impl SyncConfigStored {
    pub fn is_configured(&self) -> bool {
        !self.endpoint.trim().is_empty()
            && !self.bucket.trim().is_empty()
            && !self.access_key_id.trim().is_empty()
            && !self.secret_access_key.trim().is_empty()
    }

    pub fn sync_scope(&self) -> SyncScope {
        SyncScope {
            include_photos: self.sync_include_photos,
            include_reports: self.sync_include_reports,
            include_settings: self.sync_include_settings,
            include_workbench: self.sync_include_workbench,
        }
    }

    pub fn to_credentials(&self) -> S3Credentials {
        S3Credentials {
            endpoint: self.endpoint.trim().to_string(),
            region: {
                let r = self.region.trim();
                if r.is_empty() {
                    "auto".to_string()
                } else {
                    r.to_string()
                }
            },
            bucket: self.bucket.trim().to_string(),
            prefix: normalize_prefix(&self.prefix),
            access_key_id: self.access_key_id.trim().to_string(),
            secret_access_key: self.secret_access_key.trim().to_string(),
            force_path_style: self.force_path_style,
        }
    }

    pub fn to_view(&self) -> SyncConfigView {
        let masked = mask_secret(&self.secret_access_key);
        let effective_e2ee = !self.e2ee_passphrase.is_empty();
        SyncConfigView {
            enabled: self.enabled,
            configured: self.is_configured(),
            provider_preset: self.provider_preset.clone(),
            endpoint: self.endpoint.clone(),
            region: self.region.clone(),
            bucket: self.bucket.clone(),
            prefix: self.prefix.clone(),
            access_key_id: self.access_key_id.clone(),
            has_secret_access_key: !self.secret_access_key.trim().is_empty(),
            secret_access_key_hint: masked,
            force_path_style: self.force_path_style,
            e2ee_enabled: effective_e2ee,
            has_e2ee_passphrase: effective_e2ee,
            check_on_startup: self.check_on_startup,
            sync_include_photos: self.sync_include_photos,
            sync_include_reports: self.sync_include_reports,
            sync_include_settings: self.sync_include_settings,
            sync_include_workbench: self.sync_include_workbench,
            device_id: self.device_id.clone(),
            device_name: self.device_name.clone(),
            last_synced_rev: self.last_synced_rev,
            last_synced_at: self.last_synced_at.clone(),
        }
    }
}

fn mask_secret(secret: &str) -> String {
    let trimmed = secret.trim();
    if trimmed.is_empty() {
        return String::new();
    }
    let chars: Vec<char> = trimmed.chars().collect();
    if chars.len() <= 4 {
        return "••••".to_string();
    }
    let tail: String = chars[chars.len() - 4..].iter().collect();
    format!("••••••••{}", tail)
}

pub fn sync_config_path(data_dir: &Path) -> PathBuf {
    data_dir.join(SYNC_CONFIG_FILENAME)
}

pub fn load_sync_config(data_dir: &Path) -> SyncConfigStored {
    let path = sync_config_path(data_dir);
    if !path.exists() {
        return SyncConfigStored::default();
    }
    let Ok(raw) = fs::read_to_string(&path) else {
        return SyncConfigStored::default();
    };
    let mut cfg = serde_json::from_str::<SyncConfigStored>(&raw).unwrap_or_default();
    if cfg.device_id.trim().is_empty() {
        cfg.device_id = generate_device_id();
    }
    if cfg.device_name.trim().is_empty() {
        cfg.device_name = detect_default_device_name();
    }
    cfg
}

pub fn save_sync_config_file(data_dir: &Path, cfg: &SyncConfigStored) -> Result<(), String> {
    fs::create_dir_all(data_dir).map_err(|e| format!("创建数据目录失败: {}", e))?;
    let path = sync_config_path(data_dir);
    let tmp = data_dir.join(format!("{}.tmp.{}", SYNC_CONFIG_FILENAME, Uuid::new_v4()));
    let json = serde_json::to_string_pretty(cfg)
        .map_err(|e| format!("序列化同步配置失败: {}", e))?;
    fs::write(&tmp, json).map_err(|e| format!("写入同步配置失败: {}", e))?;

    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let _ = fs::set_permissions(&tmp, fs::Permissions::from_mode(0o600));
    }

    if path.exists() {
        let _ = fs::remove_file(&path);
    }
    fs::rename(&tmp, &path).map_err(|e| {
        let _ = fs::remove_file(&tmp);
        format!("保存同步配置失败: {}", e)
    })?;
    Ok(())
}

pub fn remove_sync_config_file(data_dir: &Path) {
    let path = sync_config_path(data_dir);
    if path.exists() {
        let _ = fs::remove_file(path);
    }
}

pub fn apply_sync_config_update(
    existing: &SyncConfigStored,
    input: SaveSyncConfigInput,
) -> Result<SyncConfigStored, String> {
    let mut next = existing.clone();
    next.enabled = input.enabled;
    if !input.provider_preset.trim().is_empty() {
        next.provider_preset = input.provider_preset.trim().to_string();
    }
    let next_endpoint = input.endpoint.trim().trim_end_matches('/').to_string();
    let next_region = {
        let r = input.region.trim();
        if r.is_empty() {
            "auto".to_string()
        } else {
            r.to_string()
        }
    };
    let next_bucket = input.bucket.trim().to_string();
    let next_prefix = normalize_prefix(&input.prefix);
    let next_ak = input.access_key_id.trim().to_string();

    let repo_changed = next_endpoint != existing.endpoint
        || next_bucket != existing.bucket
        || next_prefix != normalize_prefix(&existing.prefix);

    next.endpoint = next_endpoint;
    next.region = next_region;
    next.bucket = next_bucket;
    next.prefix = next_prefix;
    next.access_key_id = next_ak;
    next.force_path_style = input.force_path_style;
    next.check_on_startup = input.check_on_startup;

    if let Some(v) = input.sync_include_photos {
        next.sync_include_photos = v;
    }
    if let Some(v) = input.sync_include_reports {
        next.sync_include_reports = v;
    }
    if let Some(v) = input.sync_include_settings {
        next.sync_include_settings = v;
    }
    if let Some(v) = input.sync_include_workbench {
        next.sync_include_workbench = v;
    }

    if let Some(dev_name) = input.device_name {
        let trimmed = dev_name.trim();
        if !trimmed.is_empty() {
            next.device_name = trimmed.chars().take(48).collect();
        }
    }

    if input.clear_secret_access_key.unwrap_or(false) {
        next.secret_access_key.clear();
    } else if let Some(sk) = input.secret_access_key {
        let trimmed = sk.trim();
        if !trimmed.is_empty() {
            next.secret_access_key = trimmed.to_string();
        }
    }

    // Toggle-free E2EE: a non-empty passphrase enables encryption; empty/cleared disables it.
    let incoming_pass = input.e2ee_passphrase.unwrap_or_default();
    if input.clear_e2ee_passphrase.unwrap_or(false)
        || (!input.e2ee_enabled && incoming_pass.is_empty())
    {
        next.e2ee_passphrase.clear();
    } else if !incoming_pass.is_empty() {
        next.e2ee_passphrase = incoming_pass;
    }
    next.e2ee_enabled = !next.e2ee_passphrase.is_empty();

    if next.e2ee_enabled && next.e2ee_passphrase.chars().count() < 4 {
        return Err("端到端加密口令长度不能少于 4 位".to_string());
    }

    if next.enabled {
        // Validate S3 settings when sync is enabled
        let _ = S3Client::new(next.to_credentials())?;
    }

    if repo_changed {
        next.last_synced_rev = 0;
        next.last_synced_db_hash.clear();
        next.last_synced_at.clear();
    }

    Ok(next)
}

pub fn resolve_test_config(
    stored: &SyncConfigStored,
    input: TestSyncConfigInput,
) -> Result<(S3Credentials, bool, String), String> {
    let secret = input
        .secret_access_key
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(String::from)
        .unwrap_or_else(|| stored.secret_access_key.clone());

    let creds = S3Credentials {
        endpoint: input.endpoint.trim().trim_end_matches('/').to_string(),
        region: {
            let r = input.region.trim();
            if r.is_empty() {
                "auto".to_string()
            } else {
                r.to_string()
            }
        },
        bucket: input.bucket.trim().to_string(),
        prefix: normalize_prefix(&input.prefix),
        access_key_id: input.access_key_id.trim().to_string(),
        secret_access_key: secret,
        force_path_style: input.force_path_style,
    };

    let incoming_pass = input.e2ee_passphrase.unwrap_or_default();
    let passphrase = if !incoming_pass.is_empty() {
        incoming_pass
    } else if input.e2ee_enabled {
        stored.e2ee_passphrase.clone()
    } else {
        String::new()
    };
    let e2ee_enabled = !passphrase.is_empty();

    Ok((creds, e2ee_enabled, passphrase))
}

// ---------------- Remote Manifest Schema ----------------

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ManifestEncryption {
    pub algorithm: String,
    pub salt_b64: String,
    pub salt_id: String,
    pub verifier_b64: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ManifestBlob {
    pub rel_path: String,
    pub object_key: String,
    pub sha256: String,
    pub size_bytes: u64,
    pub encrypted: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncManifest {
    pub schema_version: u32,
    pub app_name: String,
    pub app_version: String,
    pub revision: u64,
    pub updated_at: String,
    pub device_id: String,
    pub device_name: String,
    pub instrument_count: usize,
    pub report_count: usize,
    pub canonical_hash: String,
    pub db_object_key: String,
    pub db_sha256: String,
    pub db_size_bytes: u64,
    pub db_compressed_bytes: u64,
    #[serde(default)]
    pub encryption: Option<ManifestEncryption>,
    #[serde(default)]
    pub blobs: Vec<ManifestBlob>,
    #[serde(default)]
    pub recent_db_keys: Vec<String>,
    #[serde(default = "default_true")]
    pub include_photos: bool,
    #[serde(default = "default_true")]
    pub include_reports: bool,
    #[serde(default = "default_true")]
    pub include_settings: bool,
    #[serde(default)]
    pub include_workbench: bool,
}

impl SyncManifest {
    pub fn sync_scope(&self) -> SyncScope {
        SyncScope {
            include_photos: self.include_photos,
            include_reports: self.include_reports,
            include_settings: self.include_settings,
            include_workbench: self.include_workbench,
        }
    }
}

// ---------------- Local Ledger Fingerprinting & State Preservation ----------------

#[derive(Debug, Clone)]
pub struct LocalLedgerSummary {
    pub canonical_hash: String,
    pub instrument_count: usize,
    pub report_count: usize,
    pub referenced_blobs: Vec<String>,
}

#[derive(Debug, Clone)]
struct WorkbenchDraftRow {
    id: String,
    name: String,
    source_rel_path: String,
    byte_length: i64,
    page_count: i64,
    marker_count: i64,
    markers_json: String,
    view_json: String,
    next_number: i64,
    compatibility: i64,
    revision: i64,
    updated_at: i64,
}

#[derive(Debug, Clone)]
struct PreservedReportRow {
    id: i64,
    instrument_id: i64,
    file_name: String,
    stored_path: String,
    file_ext: String,
    file_size: i64,
    cal_date: String,
    cal_agency: String,
    remark: String,
    uploaded_at: String,
}

#[derive(Debug, Clone, Default)]
pub struct LocalPreservedState {
    settings: Vec<(String, String)>,
    instrument_photos: Vec<(i64, String)>,
    calibration_reports: Vec<PreservedReportRow>,
    workbench_drafts: Vec<WorkbenchDraftRow>,
    workbench_state: Vec<(String, String)>,
}

fn is_local_only_setting(key: &str) -> bool {
    LOCAL_ONLY_SETTING_KEYS.contains(&key)
}

fn is_config_sync_setting(key: &str) -> bool {
    CONFIG_SYNC_SETTING_KEYS.contains(&key)
}

#[derive(Serialize)]
struct InstrumentHashRow(
    i64, String, i64, String, String, String, String, String, String, String,
    String, String, i64, String, i64, String, String, String, String, String,
    String, String, String,
);

#[cfg(test)]
pub fn compute_local_ledger_summary(conn: &Connection) -> Result<LocalLedgerSummary, String> {
    compute_local_ledger_summary_with_scope(conn, SyncScope::default())
}

/// Computes a deterministic SHA-256 fingerprint of all syncable ledger data according to `scope`,
/// plus the sorted list of managed files referenced by the DB within that scope.
pub fn compute_local_ledger_summary_with_scope(
    conn: &Connection,
    scope: SyncScope,
) -> Result<LocalLedgerSummary, String> {
    let mut hasher_input = String::with_capacity(8192);
    let mut referenced: HashSet<String> = HashSet::new();

    // 1. Instruments (core — always synced; photo_path included only when scope.include_photos)
    let mut instrument_count = 0usize;
    {
        let mut stmt = conn
            .prepare(
                "SELECT id, category, seq_no, department, name, purchase_date, serial_no,
                        model_spec, location, calibration_type, record_type, last_cal_date,
                        cal_cycle_months, next_cal_date, exempt_calibration, remark, supplier,
                        contact_person, contact_phone, cal_agency, photo_path, created_at, updated_at
                 FROM instruments ORDER BY id ASC",
            )
            .map_err(|e| format!("计算仪器摘要失败: {}", e))?;

        let rows = stmt
            .query_map([], |r| {
                Ok(InstrumentHashRow(
                    r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?, r.get(4)?, r.get(5)?, r.get(6)?,
                    r.get(7)?, r.get(8)?, r.get(9)?, r.get(10)?, r.get(11)?, r.get(12)?,
                    r.get(13)?, r.get(14)?, r.get(15)?, r.get(16)?, r.get(17)?, r.get(18)?,
                    r.get(19)?, r.get(20)?, r.get(21)?, r.get(22)?,
                ))
            })
            .map_err(|e| format!("读取仪器摘要失败: {}", e))?;

        hasher_input.push_str("INSTRUMENTS\n");
        for row in rows {
            let mut f = row.map_err(|e| format!("解析仪器摘要失败: {}", e))?;
            instrument_count += 1;
            if scope.include_photos {
                if !f.20.trim().is_empty() {
                    referenced.insert(f.20.trim().to_string());
                }
            } else {
                f.20.clear();
            }
            let line = serde_json::to_string(&f).unwrap_or_default();
            hasher_input.push_str(&line);
            hasher_input.push('\n');
        }
    }

    // 2. Calibration reports (when scope.include_reports)
    let mut report_count = 0usize;
    if scope.include_reports {
        let mut stmt = conn
            .prepare(
                "SELECT id, instrument_id, file_name, stored_path, file_ext, file_size,
                        cal_date, cal_agency, remark, uploaded_at
                 FROM calibration_reports ORDER BY id ASC",
            )
            .map_err(|e| format!("计算报告摘要失败: {}", e))?;

        let rows = stmt
            .query_map([], |r| {
                let fields: (
                    i64, i64, String, String, String, i64, String, String, String, String,
                ) = (
                    r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?, r.get(4)?, r.get(5)?, r.get(6)?,
                    r.get(7)?, r.get(8)?, r.get(9)?,
                );
                Ok(fields)
            })
            .map_err(|e| format!("读取报告摘要失败: {}", e))?;

        hasher_input.push_str("REPORTS\n");
        for row in rows {
            let f = row.map_err(|e| format!("解析报告摘要失败: {}", e))?;
            report_count += 1;
            if !f.3.trim().is_empty() {
                referenced.insert(f.3.trim().to_string());
            }
            let line = serde_json::to_string(&f).unwrap_or_default();
            hasher_input.push_str(&line);
            hasher_input.push('\n');
        }
    }

    // 3. Synced app_settings (excluding local-only device keys and optional excluded scopes)
    {
        let mut stmt = conn
            .prepare("SELECT key, value FROM app_settings ORDER BY key ASC")
            .map_err(|e| format!("计算配置摘要失败: {}", e))?;
        let rows = stmt
            .query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?)))
            .map_err(|e| format!("读取配置摘要失败: {}", e))?;

        hasher_input.push_str("SETTINGS\n");
        for row in rows {
            let (k, v) = row.map_err(|e| format!("解析配置摘要失败: {}", e))?;
            if is_local_only_setting(&k) {
                continue;
            }
            if !scope.include_settings && is_config_sync_setting(&k) {
                continue;
            }
            if k == "company_logo_path" || k == "admin_avatar_path" {
                if !scope.include_photos {
                    continue;
                }
                if !v.trim().is_empty() {
                    referenced.insert(v.trim().to_string());
                }
            }
            let line = serde_json::to_string(&(&k, &v)).unwrap_or_default();
            hasher_input.push_str(&line);
            hasher_input.push('\n');
        }
    }

    // 4. Optional QI/QC Workbench drafts (when scope.include_workbench)
    if scope.include_workbench {
        hasher_input.push_str("WORKBENCH\n");
        if let Ok(mut stmt) = conn.prepare(
            "SELECT id, name, source_rel_path, byte_length, page_count, marker_count,
                    markers_json, view_json, next_number, compatibility, revision, updated_at
             FROM workbench_pdf_drafts ORDER BY id ASC",
        ) {
            if let Ok(rows) = stmt.query_map([], |r| {
                let fields: (
                    String, String, String, i64, i64, i64, String, String, i64, i64, i64, i64,
                ) = (
                    r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?, r.get(4)?, r.get(5)?,
                    r.get(6)?, r.get(7)?, r.get(8)?, r.get(9)?, r.get(10)?, r.get(11)?,
                );
                Ok(fields)
            }) {
                for row in rows.flatten() {
                    if !row.2.trim().is_empty() {
                        referenced.insert(row.2.trim().to_string());
                    }
                    let line = serde_json::to_string(&row).unwrap_or_default();
                    hasher_input.push_str(&line);
                    hasher_input.push('\n');
                }
            }
        }
        if let Ok(mut stmt) = conn.prepare("SELECT key, value FROM workbench_pdf_state ORDER BY key ASC") {
            if let Ok(rows) = stmt.query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?))) {
                for (k, v) in rows.flatten() {
                    let line = serde_json::to_string(&(&k, &v)).unwrap_or_default();
                    hasher_input.push_str(&line);
                    hasher_input.push('\n');
                }
            }
        }
    }

    let mut referenced_blobs: Vec<String> = referenced.into_iter().collect();
    referenced_blobs.sort();

    Ok(LocalLedgerSummary {
        canonical_hash: sha256_hex(hasher_input.as_bytes()),
        instrument_count,
        report_count,
        referenced_blobs,
    })
}

#[cfg(test)]
pub fn build_clean_sync_db_snapshot(conn: &Connection) -> Result<(Vec<u8>, LocalLedgerSummary), String> {
    build_clean_sync_db_snapshot_with_scope(conn, SyncScope::default())
}

/// Exports a clean, standalone SQLite snapshot stripping excluded scopes & device-local settings.
pub fn build_clean_sync_db_snapshot_with_scope(
    conn: &Connection,
    scope: SyncScope,
) -> Result<(Vec<u8>, LocalLedgerSummary), String> {
    let summary = compute_local_ledger_summary_with_scope(conn, scope)?;
    let temp_snap = std::env::temp_dir().join(format!("ledger_sync_snap_{}.db", Uuid::new_v4()));
    if temp_snap.exists() {
        let _ = fs::remove_file(&temp_snap);
    }

    let snap_str = temp_snap
        .to_str()
        .ok_or_else(|| "临时同步快照路径无效".to_string())?;
    conn.execute("VACUUM INTO ?1", params![snap_str])
        .map_err(|e| format!("导出同步数据库快照失败: {}", e))?;

    // Strip pure device-local settings and any disabled sync scopes from the exported snapshot
    {
        let snap_conn = Connection::open(&temp_snap)
            .map_err(|e| format!("打开临时快照数据库失败: {}", e))?;
        if !scope.include_workbench {
            snap_conn
                .execute_batch("DELETE FROM workbench_pdf_drafts; DELETE FROM workbench_pdf_state;")
                .map_err(|e| format!("清理快照工作台缓存表失败: {}", e))?;
        }
        if !scope.include_reports {
            let _ = snap_conn.execute_batch("DELETE FROM calibration_reports;");
        }
        if !scope.include_photos {
            let _ = snap_conn.execute_batch(
                "UPDATE instruments SET photo_path = '';
                 DELETE FROM app_settings WHERE key IN ('company_logo_path', 'admin_avatar_path');",
            );
        }
        if !scope.include_settings {
            for key in CONFIG_SYNC_SETTING_KEYS {
                let _ = snap_conn.execute("DELETE FROM app_settings WHERE key = ?1", params![key]);
            }
        }
        for key in LOCAL_ONLY_SETTING_KEYS {
            let _ = snap_conn.execute("DELETE FROM app_settings WHERE key = ?1", params![key]);
        }
        let _ = snap_conn.execute_batch("VACUUM;");
    }

    let bytes = fs::read(&temp_snap).map_err(|e| format!("读取同步快照文件失败: {}", e))?;
    let _ = fs::remove_file(&temp_snap);
    Ok((bytes, summary))
}

pub fn capture_local_device_state_for_scope(
    conn: &Connection,
    effective_scope: SyncScope,
) -> Result<LocalPreservedState, String> {
    let mut state = LocalPreservedState::default();

    for key in LOCAL_ONLY_SETTING_KEYS {
        if let Ok(Some(val)) = crate::db::get_setting(conn, key) {
            state.settings.push(((*key).to_string(), val));
        }
    }

    if !effective_scope.include_settings {
        for key in CONFIG_SYNC_SETTING_KEYS {
            if let Ok(Some(val)) = crate::db::get_setting(conn, key) {
                state.settings.push(((*key).to_string(), val));
            }
        }
    }

    if !effective_scope.include_photos {
        for key in ["company_logo_path", "admin_avatar_path"] {
            if let Ok(Some(val)) = crate::db::get_setting(conn, key) {
                state.settings.push((key.to_string(), val));
            }
        }
        if let Ok(mut stmt) = conn.prepare("SELECT id, photo_path FROM instruments WHERE photo_path != ''") {
            if let Ok(rows) = stmt.query_map([], |r| Ok((r.get::<_, i64>(0)?, r.get::<_, String>(1)?))) {
                for r in rows.flatten() {
                    state.instrument_photos.push(r);
                }
            }
        }
    }

    if !effective_scope.include_reports {
        if let Ok(mut stmt) = conn.prepare(
            "SELECT id, instrument_id, file_name, stored_path, file_ext, file_size,
                    cal_date, cal_agency, remark, uploaded_at
             FROM calibration_reports",
        ) {
            if let Ok(rows) = stmt.query_map([], |r| {
                Ok(PreservedReportRow {
                    id: r.get(0)?,
                    instrument_id: r.get(1)?,
                    file_name: r.get(2)?,
                    stored_path: r.get(3)?,
                    file_ext: r.get(4)?,
                    file_size: r.get(5)?,
                    cal_date: r.get(6)?,
                    cal_agency: r.get(7)?,
                    remark: r.get(8)?,
                    uploaded_at: r.get(9)?,
                })
            }) {
                for r in rows.flatten() {
                    state.calibration_reports.push(r);
                }
            }
        }
    }

    if !effective_scope.include_workbench {
        if let Ok(mut stmt) = conn.prepare(
            "SELECT id, name, source_rel_path, byte_length, page_count, marker_count,
                    markers_json, view_json, next_number, compatibility, revision, updated_at
             FROM workbench_pdf_drafts",
        ) {
            if let Ok(rows) = stmt.query_map([], |r| {
                Ok(WorkbenchDraftRow {
                    id: r.get(0)?,
                    name: r.get(1)?,
                    source_rel_path: r.get(2)?,
                    byte_length: r.get(3)?,
                    page_count: r.get(4)?,
                    marker_count: r.get(5)?,
                    markers_json: r.get(6)?,
                    view_json: r.get(7)?,
                    next_number: r.get(8)?,
                    compatibility: r.get(9)?,
                    revision: r.get(10)?,
                    updated_at: r.get(11)?,
                })
            }) {
                for r in rows.flatten() {
                    state.workbench_drafts.push(r);
                }
            }
        }

        if let Ok(mut stmt) = conn.prepare("SELECT key, value FROM workbench_pdf_state") {
            if let Ok(rows) = stmt.query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?)))
            {
                for r in rows.flatten() {
                    state.workbench_state.push(r);
                }
            }
        }
    }

    Ok(state)
}

pub fn restore_local_device_state(
    conn: &Connection,
    preserved: &LocalPreservedState,
    effective_scope: SyncScope,
) -> Result<(), String> {
    for (k, v) in &preserved.settings {
        set_setting(conn, k, v)?;
    }

    if !effective_scope.include_photos {
        for (inst_id, photo_path) in &preserved.instrument_photos {
            let _ = conn.execute(
                "UPDATE instruments SET photo_path = ?1 WHERE id = ?2",
                params![photo_path, inst_id],
            );
        }
    }

    if !effective_scope.include_reports {
        let _ = conn.execute("DELETE FROM calibration_reports", []);
        for r in &preserved.calibration_reports {
            let exists: i64 = conn
                .query_row(
                    "SELECT COUNT(*) FROM instruments WHERE id = ?1",
                    params![r.instrument_id],
                    |row| row.get(0),
                )
                .unwrap_or(0);
            if exists > 0 {
                let _ = conn.execute(
                    "INSERT OR REPLACE INTO calibration_reports (
                        id, instrument_id, file_name, stored_path, file_ext, file_size,
                        cal_date, cal_agency, remark, uploaded_at
                    ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
                    params![
                        r.id,
                        r.instrument_id,
                        r.file_name,
                        r.stored_path,
                        r.file_ext,
                        r.file_size,
                        r.cal_date,
                        r.cal_agency,
                        r.remark,
                        r.uploaded_at,
                    ],
                );
            }
        }
    }

    if !effective_scope.include_workbench {
        let _ = conn.execute_batch("DELETE FROM workbench_pdf_drafts; DELETE FROM workbench_pdf_state;");
        for d in &preserved.workbench_drafts {
            conn.execute(
                "INSERT OR REPLACE INTO workbench_pdf_drafts (
                    id, name, source_rel_path, byte_length, page_count, marker_count,
                    markers_json, view_json, next_number, compatibility, revision, updated_at
                ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)",
                params![
                    d.id,
                    d.name,
                    d.source_rel_path,
                    d.byte_length,
                    d.page_count,
                    d.marker_count,
                    d.markers_json,
                    d.view_json,
                    d.next_number,
                    d.compatibility,
                    d.revision,
                    d.updated_at,
                ],
            )
            .map_err(|e| format!("还原本地工作台草稿索引失败: {}", e))?;
        }

        for (k, v) in &preserved.workbench_state {
            conn.execute(
                "INSERT OR REPLACE INTO workbench_pdf_state (key, value) VALUES (?1, ?2)",
                params![k, v],
            )
            .map_err(|e| format!("还原本地工作台状态失败: {}", e))?;
        }
    }

    Ok(())
}

#[cfg(test)]
pub fn apply_pulled_snapshot_locally(
    conn_guard: &mut Connection,
    db_path: &Path,
    data_dir: &Path,
    staged_db_path: &Path,
    staged_blobs_dir: &Path,
    manifest_blobs: &[ManifestBlob],
    create_safety_backup: bool,
) -> Result<Option<String>, String> {
    apply_pulled_snapshot_locally_with_scope(
        conn_guard,
        db_path,
        data_dir,
        staged_db_path,
        staged_blobs_dir,
        manifest_blobs,
        create_safety_backup,
        SyncScope::default(),
    )
}

/// Applies a verified pulled SQLite snapshot and staged blobs locally while preserving
/// device-local settings and any data scopes not included in `effective_scope`.
pub fn apply_pulled_snapshot_locally_with_scope(
    conn_guard: &mut Connection,
    db_path: &Path,
    data_dir: &Path,
    staged_db_path: &Path,
    staged_blobs_dir: &Path,
    manifest_blobs: &[ManifestBlob],
    create_safety_backup: bool,
    effective_scope: SyncScope,
) -> Result<Option<String>, String> {
    // 1. Optional safety backup of current local ledger before overwriting
    let safety_backup_path = if create_safety_backup {
        let ic: usize = conn_guard
            .query_row("SELECT COUNT(*) FROM instruments", [], |r| r.get(0))
            .unwrap_or(0);
        let rc: usize = conn_guard
            .query_row("SELECT COUNT(*) FROM calibration_reports", [], |r| r.get(0))
            .unwrap_or(0);
        if ic > 0 || rc > 0 {
            let bak_dir = data_dir.join("sync_backups");
            fs::create_dir_all(&bak_dir)
                .map_err(|e| format!("创建同步安全备份目录失败: {}", e))?;
            let ts = Local::now().format("%Y%m%d_%H%M%S");
            let dest = bak_dir.join(format!("同步拉取前自动备份_{}.zip", ts));
            create_backup_with_options(conn_guard, data_dir, &dest, effective_scope.include_workbench)?;
            prune_old_safety_backups(&bak_dir, MAX_SAFETY_BACKUPS);
            Some(dest.to_string_lossy().to_string())
        } else {
            None
        }
    } else {
        None
    };

    // 2. Preserve local-only device settings and excluded local data scopes
    let preserved = capture_local_device_state_for_scope(conn_guard, effective_scope)?;

    // 3. Release active SQLite file lock cleanly (essential on Windows)
    let mem_conn =
        Connection::open_in_memory().map_err(|e| format!("切换临时内存库失败: {}", e))?;
    *conn_guard = mem_conn;

    let wal_path = db_path.with_extension("db-wal");
    let shm_path = db_path.with_extension("db-shm");
    let _ = fs::remove_file(&wal_path);
    let _ = fs::remove_file(&shm_path);

    if let Err(e) = fs::copy(staged_db_path, db_path) {
        if let Ok(reopened) = init_db(db_path) {
            *conn_guard = reopened;
        }
        return Err(format!("替换本地数据库失败: {}", e));
    }

    // 4. Copy newly downloaded blobs for enabled folders
    ensure_storage_dirs(data_dir)?;
    let mut keep_paths: HashSet<PathBuf> = HashSet::new();
    for blob in manifest_blobs {
        if !effective_scope.allows_blob_rel_path(&blob.rel_path) {
            continue;
        }
        let target = resolve_sync_blob_path(data_dir, &blob.rel_path)?;
        keep_paths.insert(target.clone());

        let staged_file = staged_blobs_dir.join(&blob.rel_path);
        if staged_file.exists() {
            if let Some(parent) = target.parent() {
                fs::create_dir_all(parent).map_err(|e| format!("创建附件目录失败: {}", e))?;
            }
            fs::copy(&staged_file, &target)
                .map_err(|e| format!("写入同步附件失败 ({}): {}", blob.rel_path, e))?;
        }
    }

    // 5. Remove stale unreferenced local files ONLY in folders that were actually synced
    let mut synced_folders: Vec<&str> = Vec::with_capacity(3);
    if effective_scope.include_photos {
        synced_folders.push("images");
    }
    if effective_scope.include_reports {
        synced_folders.push("reports");
    }
    if effective_scope.include_workbench {
        synced_folders.push("workbench");
    }

    for folder in synced_folders {
        let root = data_dir.join(folder);
        if !root.exists() {
            continue;
        }
        for entry in WalkDir::new(&root).into_iter().filter_map(|e| e.ok()) {
            if entry.file_type().is_file() && !keep_paths.contains(entry.path()) {
                let _ = fs::remove_file(entry.path());
            }
        }
        // Clean up empty subdirectories under reports/
        if folder == "reports" {
            for entry in WalkDir::new(&root)
                .min_depth(1)
                .max_depth(1)
                .into_iter()
                .filter_map(|e| e.ok())
            {
                if entry.file_type().is_dir() {
                    let is_empty = fs::read_dir(entry.path())
                        .map(|mut rd| rd.next().is_none())
                        .unwrap_or(false);
                    if is_empty {
                        let _ = fs::remove_dir(entry.path());
                    }
                }
            }
        }
    }

    // 6. Reopen SQLite DB and restore preserved local device settings & excluded scopes
    let new_conn = init_db(db_path)?;
    restore_local_device_state(&new_conn, &preserved, effective_scope)?;
    *conn_guard = new_conn;

    Ok(safety_backup_path)
}

fn prune_old_safety_backups(bak_dir: &Path, keep: usize) {
    let Ok(entries) = fs::read_dir(bak_dir) else {
        return;
    };
    let mut zips: Vec<(std::time::SystemTime, PathBuf)> = entries
        .filter_map(|e| e.ok())
        .filter(|e| {
            e.path()
                .extension()
                .and_then(|s| s.to_str())
                .map(|s| s.eq_ignore_ascii_case("zip"))
                .unwrap_or(false)
        })
        .filter_map(|e| {
            let mtime = e
                .metadata()
                .ok()
                .and_then(|m| m.modified().ok())
                .unwrap_or(std::time::UNIX_EPOCH);
            Some((mtime, e.path()))
        })
        .collect();
    zips.sort_by(|a, b| b.0.cmp(&a.0));
    for (_, old_path) in zips.into_iter().skip(keep) {
        let _ = fs::remove_file(old_path);
    }
}

// ---------------- Status Evaluation Logic (Pure Function for Unit Testing) ----------------

pub fn evaluate_sync_status(
    cfg: &SyncConfigStored,
    local: &LocalLedgerSummary,
    remote: Option<&SyncManifest>,
) -> SyncStatusResult {
    let configured = cfg.is_configured();
    if !configured {
        return SyncStatusResult {
            configured: false,
            enabled: cfg.enabled,
            state: "unconfigured".to_string(),
            summary: "尚未配置 S3 云端同步".to_string(),
            local_instrument_count: local.instrument_count,
            local_report_count: local.report_count,
            local_changed: false,
            last_synced_rev: cfg.last_synced_rev,
            last_synced_at: cfg.last_synced_at.clone(),
            remote_revision: None,
            remote_updated_at: None,
            remote_device_name: None,
            remote_instrument_count: None,
            remote_report_count: None,
            remote_encrypted: false,
            local_e2ee_enabled: cfg.e2ee_enabled,
            encryption_mismatch: false,
            passphrase_error: None,
        };
    }

    if !cfg.enabled {
        return SyncStatusResult {
            configured: true,
            enabled: false,
            state: "disabled".to_string(),
            summary: "云端同步已暂停".to_string(),
            local_instrument_count: local.instrument_count,
            local_report_count: local.report_count,
            local_changed: false,
            last_synced_rev: cfg.last_synced_rev,
            last_synced_at: cfg.last_synced_at.clone(),
            remote_revision: None,
            remote_updated_at: None,
            remote_device_name: None,
            remote_instrument_count: None,
            remote_report_count: None,
            remote_encrypted: false,
            local_e2ee_enabled: cfg.e2ee_enabled,
            encryption_mismatch: false,
            passphrase_error: None,
        };
    }

    let local_has_data = local.instrument_count > 0 || local.report_count > 0;

    let Some(rm) = remote else {
        let state = if local_has_data {
            "local_ahead"
        } else {
            "up_to_date"
        };
        let summary = if local_has_data {
            "云端尚无数据，可首次推送本地台账到云端".to_string()
        } else {
            "本地与云端均暂无台账数据".to_string()
        };
        return SyncStatusResult {
            configured: true,
            enabled: true,
            state: state.to_string(),
            summary,
            local_instrument_count: local.instrument_count,
            local_report_count: local.report_count,
            local_changed: local_has_data,
            last_synced_rev: cfg.last_synced_rev,
            last_synced_at: cfg.last_synced_at.clone(),
            remote_revision: None,
            remote_updated_at: None,
            remote_device_name: None,
            remote_instrument_count: None,
            remote_report_count: None,
            remote_encrypted: false,
            local_e2ee_enabled: cfg.e2ee_enabled,
            encryption_mismatch: false,
            passphrase_error: None,
        };
    };

    let remote_encrypted = rm.encryption.is_some();
    let encryption_mismatch = cfg.e2ee_enabled != remote_encrypted;

    // Validate passphrase upfront if remote is encrypted
    let passphrase_error = if let Some(ref enc) = rm.encryption {
        if !cfg.e2ee_enabled || cfg.e2ee_passphrase.is_empty() {
            Some("云端数据已启用端到端加密，请在对象存储配置中填写加密口令".to_string())
        } else {
            match decode_b64(&enc.salt_b64)
                .and_then(|salt| derive_e2ee_key(&cfg.e2ee_passphrase, &salt))
            {
                Ok(key) => {
                    if verify_key_with_verifier(&key, &enc.verifier_b64) {
                        None
                    } else {
                        Some("端到端加密口令不正确，无法解密云端数据".to_string())
                    }
                }
                Err(e) => Some(e),
            }
        }
    } else {
        None
    };

    let same_content = local.canonical_hash == rm.canonical_hash;

    let (state, local_changed, summary) = if same_content {
        if cfg.e2ee_enabled && !remote_encrypted {
            (
                "local_ahead",
                true,
                "已开启端到端加密，点击同步将推送加密版本至云端".to_string(),
            )
        } else {
            (
                "up_to_date",
                false,
                format!("本地与云端已是最新（版本 r{}）", rm.revision),
            )
        }
    } else if cfg.last_synced_rev == 0 {
        // Freshly linked device
        if !local_has_data {
            (
                "remote_ahead",
                false,
                format!(
                    "云端存在台账数据（r{}，{} 台设备），可一键拉取",
                    rm.revision, rm.instrument_count
                ),
            )
        } else {
            (
                "conflict",
                true,
                format!(
                    "本机与云端（r{}）均存在不同台账数据，请选择保留哪一端",
                    rm.revision
                ),
            )
        }
    } else {
        let local_dirty = local.canonical_hash != cfg.last_synced_db_hash;
        let remote_dirty = rm.revision != cfg.last_synced_rev;

        match (local_dirty, remote_dirty) {
            (false, false) => (
                "up_to_date",
                false,
                format!("本地与云端已是最新（版本 r{}）", rm.revision),
            ),
            (true, false) => (
                "local_ahead",
                true,
                format!("本地有未推送变更（云端当前 r{}）", rm.revision),
            ),
            (false, true) => (
                "remote_ahead",
                false,
                format!(
                    "云端发现新版本 r{}（来自 {}），可拉取更新",
                    rm.revision, rm.device_name
                ),
            ),
            (true, true) => (
                "conflict",
                true,
                format!(
                    "本地与云端（r{}，来自 {}）均有新变更，请手动选择合并方向",
                    rm.revision, rm.device_name
                ),
            ),
        }
    };

    SyncStatusResult {
        configured: true,
        enabled: true,
        state: state.to_string(),
        summary,
        local_instrument_count: local.instrument_count,
        local_report_count: local.report_count,
        local_changed,
        last_synced_rev: cfg.last_synced_rev,
        last_synced_at: cfg.last_synced_at.clone(),
        remote_revision: Some(rm.revision),
        remote_updated_at: Some(rm.updated_at.clone()),
        remote_device_name: Some(rm.device_name.clone()),
        remote_instrument_count: Some(rm.instrument_count),
        remote_report_count: Some(rm.report_count),
        remote_encrypted,
        local_e2ee_enabled: cfg.e2ee_enabled,
        encryption_mismatch,
        passphrase_error,
    }
}

// ---------------- Async Network Operations ----------------

fn emit_sync_progress(
    app: &AppHandle,
    phase: &str,
    message: &str,
    current: usize,
    total: usize,
    percent: f64,
) {
    let _ = app.emit(
        "sync-progress",
        SyncProgressEvent {
            phase: phase.to_string(),
            message: message.to_string(),
            current,
            total,
            percent,
        },
    );
}

async fn fetch_remote_manifest(
    client: &S3Client,
) -> Result<Option<(SyncManifest, Option<String>)>, String> {
    let Some((bytes, etag)) = client.get_object(MANIFEST_KEY).await? else {
        return Ok(None);
    };
    let manifest: SyncManifest = serde_json::from_slice(&bytes)
        .map_err(|e| format!("解析云端同步清单 manifest.json 失败: {}", e))?;
    Ok(Some((manifest, etag)))
}

pub async fn test_s3_sync_connection(
    creds: S3Credentials,
    e2ee_enabled: bool,
    e2ee_passphrase: &str,
) -> Result<SyncTestResult, String> {
    let client = S3Client::new(creds)?;
    client.test_connection().await?;

    let remote = fetch_remote_manifest(&client).await?;
    match remote {
        Some((rm, _)) => {
            let remote_encrypted = rm.encryption.is_some();
            let passphrase_verified = if let Some(ref enc) = rm.encryption {
                if !e2ee_enabled || e2ee_passphrase.is_empty() {
                    Some(false)
                } else {
                    let ok = decode_b64(&enc.salt_b64)
                        .and_then(|salt| derive_e2ee_key(e2ee_passphrase, &salt))
                        .map(|key| verify_key_with_verifier(&key, &enc.verifier_b64))
                        .unwrap_or(false);
                    Some(ok)
                }
            } else {
                None
            };

            let msg = match (remote_encrypted, passphrase_verified) {
                (true, Some(true)) => format!(
                    "连接成功！检测到云端加密台账（r{}，{} 台设备），加密口令校验通过",
                    rm.revision, rm.instrument_count
                ),
                (true, Some(false)) => format!(
                    "连接成功！检测到云端加密台账（r{}，{} 台设备），但当前加密口令未填写或不正确",
                    rm.revision, rm.instrument_count
                ),
                _ => format!(
                    "连接成功！检测到云端台账（r{}，{} 台设备，{} 份报告）",
                    rm.revision, rm.instrument_count, rm.report_count
                ),
            };

            Ok(SyncTestResult {
                ok: true,
                message: msg,
                has_remote_data: true,
                remote_revision: Some(rm.revision),
                remote_instrument_count: Some(rm.instrument_count),
                remote_report_count: Some(rm.report_count),
                remote_updated_at: Some(rm.updated_at),
                remote_device_name: Some(rm.device_name),
                remote_encrypted,
                passphrase_verified,
            })
        }
        None => Ok(SyncTestResult {
            ok: true,
            message: "连接成功！存储桶可正常读写，云端暂无历史同步数据".to_string(),
            has_remote_data: false,
            remote_revision: None,
            remote_instrument_count: None,
            remote_report_count: None,
            remote_updated_at: None,
            remote_device_name: None,
            remote_encrypted: false,
            passphrase_verified: None,
        }),
    }
}

pub async fn check_remote_sync_status(
    cfg: &SyncConfigStored,
    local: &LocalLedgerSummary,
) -> Result<SyncStatusResult, String> {
    if !cfg.is_configured() || !cfg.enabled {
        return Ok(evaluate_sync_status(cfg, local, None));
    }
    let client = S3Client::new(cfg.to_credentials())?;
    let remote = fetch_remote_manifest(&client).await?;
    Ok(evaluate_sync_status(
        cfg,
        local,
        remote.as_ref().map(|(m, _)| m),
    ))
}

pub async fn execute_push(
    app: &AppHandle,
    cfg: &mut SyncConfigStored,
    data_dir: &Path,
    db_bytes: Vec<u8>,
    local: LocalLedgerSummary,
    force: bool,
) -> Result<SyncActionResult, String> {
    if !cfg.is_configured() || !cfg.enabled {
        return Err("请先配置并启用 S3 云端同步".to_string());
    }
    if cfg.e2ee_enabled && cfg.e2ee_passphrase.is_empty() {
        return Err("已启用端到端加密，请先填写加密口令".to_string());
    }

    emit_sync_progress(app, "checking", "正在检查云端版本状态...", 0, 1, 5.0);
    let client = S3Client::new(cfg.to_credentials())?;
    let remote_opt = fetch_remote_manifest(&client).await?;

    let status = evaluate_sync_status(cfg, &local, remote_opt.as_ref().map(|(m, _)| m));
    if !force && (status.state == "conflict" || status.state == "remote_ahead") {
        return Err(format!("CONFLICT:{}", status.summary));
    }
    if !force && status.remote_encrypted && !cfg.e2ee_enabled {
        return Err(
            "云端当前已启用端到端加密，请填写原加密口令，或在确认后使用「推送覆盖云端」切换为明文".to_string(),
        );
    }

    let (remote_manifest, remote_etag) = match remote_opt {
        Some((m, etag)) => (Some(m), etag),
        None => (None, None),
    };

    // Determine encryption key & manifest metadata
    let (e2ee_key, manifest_encryption): (Option<[u8; 32]>, Option<ManifestEncryption>) =
        if cfg.e2ee_enabled {
            // Reuse remote salt if remote is already encrypted with the same passphrase so blobs stay deduplicated!
            let reused = remote_manifest
                .as_ref()
                .and_then(|rm| rm.encryption.as_ref())
                .and_then(|enc| {
                    let salt = decode_b64(&enc.salt_b64).ok()?;
                    let key = derive_e2ee_key(&cfg.e2ee_passphrase, &salt).ok()?;
                    if verify_key_with_verifier(&key, &enc.verifier_b64) {
                        Some((key, enc.clone()))
                    } else {
                        None
                    }
                });

            if let Some((key, enc)) = reused {
                (Some(key), Some(enc))
            } else {
                if !force && remote_manifest.as_ref().and_then(|rm| rm.encryption.as_ref()).is_some() {
                    return Err("端到端加密口令与云端现有口令不一致，请核对口令或确认强制覆盖".to_string());
                }
                let salt = generate_random_salt()?;
                let key = derive_e2ee_key(&cfg.e2ee_passphrase, &salt)?;
                let verifier_b64 = create_key_verifier(&key)?;
                let enc = ManifestEncryption {
                    algorithm: E2EE_ALGORITHM.to_string(),
                    salt_id: salt_id_from_bytes(&salt),
                    salt_b64: encode_b64(&salt),
                    verifier_b64,
                };
                (Some(key), Some(enc))
            }
        } else {
            (None, None)
        };

    // Build lookup of blobs already present on remote with matching object_key + sha256
    let mut existing_remote_blobs: HashMap<String, String> = HashMap::new();
    if let Some(ref rm) = remote_manifest {
        for b in &rm.blobs {
            existing_remote_blobs.insert(b.object_key.clone(), b.sha256.clone());
        }
    }

    // Prepare & upload referenced blobs incrementally
    let total_blobs = local.referenced_blobs.len();
    let mut uploaded_blobs = 0usize;
    let mut skipped_blobs = 0usize;
    let mut new_manifest_blobs: Vec<ManifestBlob> = Vec::with_capacity(total_blobs);

    for (idx, rel_path) in local.referenced_blobs.iter().enumerate() {
        let abs_path = resolve_sync_blob_path(data_dir, rel_path)?;
        if !abs_path.exists() {
            continue;
        }
        let raw_bytes = fs::read(&abs_path)
            .map_err(|e| format!("读取待同步附件失败 ({}): {}", rel_path, e))?;
        let plain_sha = sha256_hex(&raw_bytes);
        let size_bytes = raw_bytes.len() as u64;

        let (object_key, encrypted) = if let Some(ref enc) = manifest_encryption {
            (format!("blobs/enc/{}/{}", enc.salt_id, plain_sha), true)
        } else {
            (format!("blobs/raw/{}", plain_sha), false)
        };

        let pct = 10.0 + ((idx + 1) as f64 / total_blobs.max(1) as f64) * 65.0;
        if existing_remote_blobs.get(&object_key).map(String::as_str) == Some(plain_sha.as_str()) {
            skipped_blobs += 1;
            emit_sync_progress(
                app,
                "uploading",
                &format!("核验附件 ({}/{})...", idx + 1, total_blobs),
                idx + 1,
                total_blobs,
                pct,
            );
        } else {
            emit_sync_progress(
                app,
                "uploading",
                &format!("上传新增附件 ({}/{})...", idx + 1, total_blobs),
                idx + 1,
                total_blobs,
                pct,
            );
            let payload = if let Some(ref key) = e2ee_key {
                encrypt_bytes(key, object_key.as_bytes(), &raw_bytes)?
            } else {
                raw_bytes
            };
            client
                .put_object(
                    &object_key,
                    payload,
                    "application/octet-stream",
                    None,
                    false,
                )
                .await
                .map_err(S3PutError::into_message)?;
            uploaded_blobs += 1;
        }

        new_manifest_blobs.push(ManifestBlob {
            rel_path: rel_path.clone(),
            object_key,
            sha256: plain_sha,
            size_bytes,
            encrypted,
        });
    }

    // Compress & optionally encrypt SQLite snapshot
    emit_sync_progress(app, "uploading", "正在上传台账数据库快照...", 0, 1, 82.0);
    let next_rev = remote_manifest.as_ref().map(|m| m.revision).unwrap_or(0) + 1;
    let db_sha256 = sha256_hex(&db_bytes);
    let db_size_bytes = db_bytes.len() as u64;
    let compressed_db = gzip_compress(&db_bytes)?;
    let hash8: String = db_sha256.chars().take(8).collect();
    let db_object_key = if manifest_encryption.is_some() {
        format!("db/ledger_r{}_{}.db.gz.enc", next_rev, hash8)
    } else {
        format!("db/ledger_r{}_{}.db.gz", next_rev, hash8)
    };
    let db_upload_payload = if let Some(ref key) = e2ee_key {
        encrypt_bytes(key, db_object_key.as_bytes(), &compressed_db)?
    } else {
        compressed_db
    };
    let db_compressed_bytes = db_upload_payload.len() as u64;

    client
        .put_object(
            &db_object_key,
            db_upload_payload,
            "application/octet-stream",
            None,
            false,
        )
        .await
        .map_err(S3PutError::into_message)?;

    // Build rolling recent DB list (keep last N snapshots)
    let mut recent_db_keys: Vec<String> = vec![db_object_key.clone()];
    let mut obsolete_db_keys: Vec<String> = Vec::new();
    if let Some(ref rm) = remote_manifest {
        let mut prev_list = rm.recent_db_keys.clone();
        if !prev_list.contains(&rm.db_object_key) {
            prev_list.insert(0, rm.db_object_key.clone());
        }
        for old_key in prev_list {
            if recent_db_keys.contains(&old_key) {
                continue;
            }
            if recent_db_keys.len() < MAX_RECENT_DB_SNAPSHOTS {
                recent_db_keys.push(old_key);
            } else {
                obsolete_db_keys.push(old_key);
            }
        }
    }

    let now = now_iso();
    let new_manifest = SyncManifest {
        schema_version: 1,
        app_name: "InstrumentLedger".to_string(),
        app_version: env!("CARGO_PKG_VERSION").to_string(),
        revision: next_rev,
        updated_at: now.clone(),
        device_id: cfg.device_id.clone(),
        device_name: cfg.device_name.clone(),
        instrument_count: local.instrument_count,
        report_count: local.report_count,
        canonical_hash: local.canonical_hash.clone(),
        db_object_key,
        db_sha256,
        db_size_bytes,
        db_compressed_bytes,
        encryption: manifest_encryption,
        blobs: new_manifest_blobs,
        recent_db_keys,
        include_photos: cfg.sync_include_photos,
        include_reports: cfg.sync_include_reports,
        include_settings: cfg.sync_include_settings,
        include_workbench: cfg.sync_include_workbench,
    };

    emit_sync_progress(app, "uploading", "正在提交云端版本清单...", 1, 1, 94.0);
    let manifest_bytes = serde_json::to_vec_pretty(&new_manifest)
        .map_err(|e| format!("序列化云端清单失败: {}", e))?;

    // Atomic commit: If-Match against previously fetched ETag (or If-None-Match when creating first manifest)
    let if_match_opt = if !force && remote_manifest.is_some() {
        remote_etag.as_deref()
    } else {
        None
    };
    let if_none_match = remote_manifest.is_none() && !force;

    client
        .put_object(
            MANIFEST_KEY,
            manifest_bytes,
            "application/json",
            if_match_opt,
            if_none_match,
        )
        .await
        .map_err(S3PutError::into_message)?;

    // Persist updated local sync cursor
    cfg.last_synced_rev = next_rev;
    cfg.last_synced_db_hash = local.canonical_hash;
    cfg.last_synced_at = now.clone();
    save_sync_config_file(data_dir, cfg)?;

    // Best-effort cleanup of obsolete DB snapshots beyond rolling window
    for old_key in obsolete_db_keys {
        let _ = client.delete_object(&old_key).await;
    }

    emit_sync_progress(app, "done", "推送完成", 1, 1, 100.0);

    Ok(SyncActionResult {
        direction: "push".to_string(),
        revision: next_rev,
        instrument_count: local.instrument_count,
        report_count: local.report_count,
        transferred_blobs: uploaded_blobs,
        skipped_blobs,
        db_bytes: db_compressed_bytes,
        encrypted: cfg.e2ee_enabled,
        synced_at: now,
        safety_backup_path: None,
        message: format!(
            "推送成功（版本 r{}，新增上传 {} 个附件，复用 {} 个附件）",
            next_rev, uploaded_blobs, skipped_blobs
        ),
    })
}

pub struct PreparedPullPayload {
    pub manifest: SyncManifest,
    pub staging_root: PathBuf,
    pub staged_db_path: PathBuf,
    pub staged_blobs_dir: PathBuf,
    pub downloaded_blobs: usize,
    pub skipped_blobs: usize,
}

pub async fn download_pull_payload(
    app: &AppHandle,
    cfg: &SyncConfigStored,
    data_dir: &Path,
    local: &LocalLedgerSummary,
    force: bool,
) -> Result<PreparedPullPayload, String> {
    if !cfg.is_configured() || !cfg.enabled {
        return Err("请先配置并启用 S3 云端同步".to_string());
    }

    emit_sync_progress(app, "checking", "正在读取云端版本清单...", 0, 1, 5.0);
    let client = S3Client::new(cfg.to_credentials())?;
    let Some((rm, _)) = fetch_remote_manifest(&client).await? else {
        return Err("云端尚无同步数据，请先从已有数据的设备执行推送".to_string());
    };

    let status = evaluate_sync_status(cfg, local, Some(&rm));
    if !force && (status.state == "conflict" || status.state == "local_ahead") {
        return Err(format!("CONFLICT:{}", status.summary));
    }

    // Verify decryption key BEFORE downloading DB or blobs
    let decrypt_key: Option<[u8; 32]> = if let Some(ref enc) = rm.encryption {
        if !cfg.e2ee_enabled || cfg.e2ee_passphrase.is_empty() {
            return Err("云端数据已启用端到端加密，请先填写端到端加密口令".to_string());
        }
        let salt = decode_b64(&enc.salt_b64)?;
        let key = derive_e2ee_key(&cfg.e2ee_passphrase, &salt)?;
        if !verify_key_with_verifier(&key, &enc.verifier_b64) {
            return Err("端到端加密口令不正确，无法解密云端数据".to_string());
        }
        Some(key)
    } else {
        None
    };

    let effective_scope = cfg.sync_scope().intersect(rm.sync_scope());

    let staging_root = std::env::temp_dir().join(format!("ledger_sync_pull_{}", Uuid::new_v4()));
    let staged_blobs_dir = staging_root.join("blobs");
    fs::create_dir_all(&staged_blobs_dir)
        .map_err(|e| format!("创建同步临时目录失败: {}", e))?;

    let res = async {
        // 1. Download & validate DB snapshot
        emit_sync_progress(app, "downloading", "正在下载云端数据库快照...", 0, 1, 15.0);
        let (raw_db_obj, _) = client
            .get_object(&rm.db_object_key)
            .await?
            .ok_or_else(|| format!("云端缺少数据库快照对象: {}", rm.db_object_key))?;

        let compressed_db = if let Some(ref key) = decrypt_key {
            decrypt_bytes(key, rm.db_object_key.as_bytes(), &raw_db_obj)?
        } else {
            raw_db_obj
        };
        let db_bytes = gzip_decompress(&compressed_db)?;
        let actual_db_sha = sha256_hex(&db_bytes);
        if actual_db_sha != rm.db_sha256 {
            return Err("云端数据库快照 SHA-256 完整性校验失败，已中止拉取".to_string());
        }

        let staged_db_path = staging_root.join("ledger.db");
        fs::write(&staged_db_path, &db_bytes)
            .map_err(|e| format!("写入临时数据库快照失败: {}", e))?;

        // Validate SQLite integrity before downloading blobs
        {
            let test_conn = Connection::open(&staged_db_path)
                .map_err(|e| format!("云端数据库文件已损坏: {}", e))?;
            let _: usize = test_conn
                .query_row("SELECT COUNT(*) FROM instruments", [], |r| r.get(0))
                .map_err(|e| format!("云端数据库结构不兼容: {}", e))?;
        }

        // 2. Incrementally download missing or hash-mismatched attachments within effective_scope
        let scoped_blobs: Vec<&ManifestBlob> = rm
            .blobs
            .iter()
            .filter(|b| effective_scope.allows_blob_rel_path(&b.rel_path))
            .collect();
        let total_blobs = scoped_blobs.len();
        let mut downloaded_blobs = 0usize;
        let mut skipped_blobs = 0usize;

        for (idx, blob) in scoped_blobs.iter().enumerate() {
            // Security: ensure rel_path stays strictly inside images/, reports/, or workbench/
            let local_target = resolve_sync_blob_path(data_dir, &blob.rel_path)?;
            let pct = 25.0 + ((idx + 1) as f64 / total_blobs.max(1) as f64) * 65.0;

            let already_valid = if local_target.exists() {
                fs::read(&local_target)
                    .map(|b| sha256_hex(&b) == blob.sha256)
                    .unwrap_or(false)
            } else {
                false
            };

            if already_valid {
                skipped_blobs += 1;
                emit_sync_progress(
                    app,
                    "downloading",
                    &format!("核验本地附件 ({}/{})...", idx + 1, total_blobs),
                    idx + 1,
                    total_blobs,
                    pct,
                );
                continue;
            }

            emit_sync_progress(
                app,
                "downloading",
                &format!("下载云端附件 ({}/{})...", idx + 1, total_blobs),
                idx + 1,
                total_blobs,
                pct,
            );
            let (raw_blob, _) = client
                .get_object(&blob.object_key)
                .await?
                .ok_or_else(|| format!("云端缺少附件对象: {}", blob.rel_path))?;

            let plain_bytes = if blob.encrypted {
                let key = decrypt_key
                    .as_ref()
                    .ok_or_else(|| "缺少解密密钥，无法解密云端附件".to_string())?;
                decrypt_bytes(key, blob.object_key.as_bytes(), &raw_blob)?
            } else {
                raw_blob
            };

            if sha256_hex(&plain_bytes) != blob.sha256 {
                return Err(format!("云端附件完整性校验失败: {}", blob.rel_path));
            }

            let out_path = staged_blobs_dir.join(&blob.rel_path);
            if let Some(parent) = out_path.parent() {
                fs::create_dir_all(parent)
                    .map_err(|e| format!("创建临时附件目录失败: {}", e))?;
            }
            fs::write(&out_path, &plain_bytes)
                .map_err(|e| format!("写入临时附件失败: {}", e))?;
            downloaded_blobs += 1;
        }

        Ok(PreparedPullPayload {
            manifest: rm,
            staging_root: staging_root.clone(),
            staged_db_path,
            staged_blobs_dir,
            downloaded_blobs,
            skipped_blobs,
        })
    }
    .await;

    if res.is_err() {
        let _ = fs::remove_dir_all(&staging_root);
    }
    res
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::workbench_store::{read_pdf_draft_meta, save_pdf_source, SavePdfSourceMeta};

    #[test]
    fn test_canonical_fingerprint_ignores_local_settings_and_workbench() {
        let root = std::env::temp_dir().join(format!("sync_fp_test_{}", Uuid::new_v4()));
        let data_dir = root.join("data");
        let db_path = data_dir.join("ledger.db");
        let conn = init_db(&db_path).unwrap();

        conn.execute(
            "INSERT INTO instruments (category, seq_no, department, name, serial_no, created_at, updated_at)
             VALUES ('gauge', 1, '品质部', '千分尺', 'M-001', '2026-11-28', '2026-11-28')",
            [],
        )
        .unwrap();

        let s1 = compute_local_ledger_summary(&conn).unwrap();
        assert_eq!(s1.instrument_count, 1);

        // Mutating local-only settings & workbench drafts MUST NOT change canonical hash
        set_setting(&conn, "close_behavior", "minimize_to_tray").unwrap();
        set_setting(&conn, "admin_session_active", "1").unwrap();
        set_setting(&conn, "app_lock_active", "1").unwrap();
        set_setting(&conn, "update_proxy_url", "https://custom.proxy/").unwrap();
        save_pdf_source(
            &conn,
            &data_dir,
            &SavePdfSourceMeta {
                id: "draft01".to_string(),
                name: "part-drawing".to_string(),
                page_count: 1,
                marker_count: 1,
                markers_json: "[]".to_string(),
                view_json: None,
                next_number: 2,
                compatibility: false,
                updated_at: 1000,
            },
            Some(b"%PDF-1.7"),
        )
        .unwrap();

        let s2 = compute_local_ledger_summary(&conn).unwrap();
        assert_eq!(s1.canonical_hash, s2.canonical_hash);

        // Mutating a synced setting or instrument MUST change canonical hash
        set_setting(&conn, "doc_title", "新台账标题").unwrap();
        let s3 = compute_local_ledger_summary(&conn).unwrap();
        assert_ne!(s1.canonical_hash, s3.canonical_hash);

        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn test_pull_apply_preserves_local_settings_and_workbench_drafts() {
        let root = std::env::temp_dir().join(format!("sync_apply_test_{}", Uuid::new_v4()));
        let dir_a = root.join("device_a");
        let dir_b = root.join("device_b");
        ensure_storage_dirs(&dir_a).unwrap();
        ensure_storage_dirs(&dir_b).unwrap();

        // Device A creates ledger data + image + clean snapshot
        let conn_a = init_db(&dir_a.join("ledger.db")).unwrap();
        set_setting(&conn_a, "doc_title", "云端最新台账").unwrap();
        set_setting(&conn_a, "close_behavior", "exit").unwrap(); // local-only on A
        fs::write(dir_a.join("images").join("photo_a.jpg"), b"jpeg-bytes-a").unwrap();
        conn_a
            .execute(
                "INSERT INTO instruments (category, seq_no, department, name, serial_no, photo_path, created_at, updated_at)
                 VALUES ('gauge', 1, '品质部', '数显卡尺', 'DC-01', 'images/photo_a.jpg', '2026-11-28', '2026-11-28')",
                [],
            )
            .unwrap();
        let (snap_bytes, summary_a) = build_clean_sync_db_snapshot(&conn_a).unwrap();
        assert_eq!(summary_a.referenced_blobs, vec!["images/photo_a.jpg".to_string()]);

        // Device B has its own local settings, workbench PDF draft, and an obsolete image
        let db_b_path = dir_b.join("ledger.db");
        let mut conn_b = init_db(&db_b_path).unwrap();
        set_setting(&conn_b, "close_behavior", "minimize_to_tray").unwrap();
        set_setting(&conn_b, "update_proxy_url", "https://my-proxy.example/").unwrap();
        fs::write(dir_b.join("images").join("stale.jpg"), b"old-stale-img").unwrap();
        save_pdf_source(
            &conn_b,
            &dir_b,
            &SavePdfSourceMeta {
                id: "localpdf1".to_string(),
                name: "b-local-drawing".to_string(),
                page_count: 1,
                marker_count: 3,
                markers_json: "[1,2,3]".to_string(),
                view_json: None,
                next_number: 4,
                compatibility: false,
                updated_at: 2000,
            },
            Some(b"%PDF-1.7-LOCAL-B"),
        )
        .unwrap();

        // Stage snapshot + blob for pull onto Device B
        let stage = root.join("stage");
        fs::create_dir_all(stage.join("blobs").join("images")).unwrap();
        let staged_db = stage.join("ledger.db");
        fs::write(&staged_db, &snap_bytes).unwrap();
        fs::write(stage.join("blobs").join("images").join("photo_a.jpg"), b"jpeg-bytes-a").unwrap();

        let blobs = vec![ManifestBlob {
            rel_path: "images/photo_a.jpg".to_string(),
            object_key: "blobs/raw/abc".to_string(),
            sha256: sha256_hex(b"jpeg-bytes-a"),
            size_bytes: 12,
            encrypted: false,
        }];

        apply_pulled_snapshot_locally(
            &mut conn_b,
            &db_b_path,
            &dir_b,
            &staged_db,
            &stage.join("blobs"),
            &blobs,
            false,
        )
        .unwrap();

        // Verify synced ledger data arrived
        assert_eq!(
            crate::db::get_setting(&conn_b, "doc_title").unwrap().as_deref(),
            Some("云端最新台账")
        );
        let inst_count: i64 = conn_b
            .query_row("SELECT COUNT(*) FROM instruments", [], |r| r.get(0))
            .unwrap();
        assert_eq!(inst_count, 1);
        assert_eq!(
            fs::read(dir_b.join("images").join("photo_a.jpg")).unwrap(),
            b"jpeg-bytes-a"
        );
        // Stale unreferenced image was cleaned up
        assert!(!dir_b.join("images").join("stale.jpg").exists());

        // Verify Device B local-only settings & workbench PDF draft were 100% preserved!
        assert_eq!(
            crate::db::get_setting(&conn_b, "close_behavior").unwrap().as_deref(),
            Some("minimize_to_tray")
        );
        assert_eq!(
            crate::db::get_setting(&conn_b, "update_proxy_url").unwrap().as_deref(),
            Some("https://my-proxy.example/")
        );
        let draft = read_pdf_draft_meta(&conn_b, &dir_b, "localpdf1").unwrap();
        assert!(draft.is_some());
        assert_eq!(draft.unwrap().name, "b-local-drawing");

        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn test_evaluate_sync_status_four_states() {
        let mut cfg = SyncConfigStored {
            enabled: true,
            endpoint: "https://abc.r2.cloudflarestorage.com".to_string(),
            region: "auto".to_string(),
            bucket: "my-bucket".to_string(),
            prefix: "ledger".to_string(),
            access_key_id: "ak".to_string(),
            secret_access_key: "sk".to_string(),
            last_synced_rev: 5,
            last_synced_db_hash: "hash_v5".to_string(),
            ..Default::default()
        };

        let make_local = |hash: &str, count: usize| LocalLedgerSummary {
            canonical_hash: hash.to_string(),
            instrument_count: count,
            report_count: 0,
            referenced_blobs: vec![],
        };
        let make_remote = |rev: u64, hash: &str| SyncManifest {
            schema_version: 1,
            app_name: "InstrumentLedger".to_string(),
            app_version: "1.4.0".to_string(),
            revision: rev,
            updated_at: "2026-11-28T00:00:00Z".to_string(),
            device_id: "dev-2".to_string(),
            device_name: "Office-PC".to_string(),
            instrument_count: 10,
            report_count: 2,
            canonical_hash: hash.to_string(),
            db_object_key: "db/ledger_r5.db.gz".to_string(),
            db_sha256: "dbsha".to_string(),
            db_size_bytes: 1000,
            db_compressed_bytes: 300,
            encryption: None,
            blobs: vec![],
            recent_db_keys: vec![],
            include_photos: true,
            include_reports: true,
            include_settings: true,
            include_workbench: false,
        };

        // 1. Up to date
        let st1 = evaluate_sync_status(&cfg, &make_local("hash_v5", 10), Some(&make_remote(5, "hash_v5")));
        assert_eq!(st1.state, "up_to_date");

        // 2. Local ahead
        let st2 = evaluate_sync_status(&cfg, &make_local("hash_v6_local", 11), Some(&make_remote(5, "hash_v5")));
        assert_eq!(st2.state, "local_ahead");

        // 3. Remote ahead
        let st3 = evaluate_sync_status(&cfg, &make_local("hash_v5", 10), Some(&make_remote(6, "hash_v6_remote")));
        assert_eq!(st3.state, "remote_ahead");

        // 4. Conflict
        let st4 = evaluate_sync_status(&cfg, &make_local("hash_v6_local", 11), Some(&make_remote(6, "hash_v6_remote")));
        assert_eq!(st4.state, "conflict");

        // 5. Fresh empty machine with remote data -> remote_ahead
        cfg.last_synced_rev = 0;
        cfg.last_synced_db_hash.clear();
        let st5 = evaluate_sync_status(&cfg, &make_local("empty_hash", 0), Some(&make_remote(6, "hash_v6_remote")));
        assert_eq!(st5.state, "remote_ahead");

        // 6. Fresh non-empty machine with different remote data -> conflict
        let st6 = evaluate_sync_status(&cfg, &make_local("other_hash", 3), Some(&make_remote(6, "hash_v6_remote")));
        assert_eq!(st6.state, "conflict");
    }

    #[test]
    fn test_toggle_free_e2ee_passphrase_and_sync_scopes() {
        let base = SyncConfigStored::default();

        // Filling passphrase auto-enables E2EE even if e2ee_enabled flag is false
        let updated = apply_sync_config_update(
            &base,
            SaveSyncConfigInput {
                enabled: false,
                provider_preset: "r2".to_string(),
                endpoint: "https://abc.r2.cloudflarestorage.com".to_string(),
                region: "auto".to_string(),
                bucket: "bucket".to_string(),
                prefix: "ledger".to_string(),
                access_key_id: "ak".to_string(),
                secret_access_key: Some("sk".to_string()),
                clear_secret_access_key: None,
                force_path_style: true,
                e2ee_enabled: false,
                e2ee_passphrase: Some("my-secret-pass".to_string()),
                clear_e2ee_passphrase: None,
                check_on_startup: true,
                sync_include_photos: Some(false),
                sync_include_reports: Some(true),
                sync_include_settings: Some(false),
                sync_include_workbench: Some(true),
                device_name: None,
            },
        )
        .unwrap();
        assert!(updated.e2ee_enabled);
        assert_eq!(updated.e2ee_passphrase, "my-secret-pass");
        assert!(!updated.sync_include_photos);
        assert!(updated.sync_include_reports);
        assert!(!updated.sync_include_settings);
        assert!(updated.sync_include_workbench);

        // Clearing passphrase disables E2EE automatically
        let cleared = apply_sync_config_update(
            &updated,
            SaveSyncConfigInput {
                enabled: false,
                provider_preset: "r2".to_string(),
                endpoint: "https://abc.r2.cloudflarestorage.com".to_string(),
                region: "auto".to_string(),
                bucket: "bucket".to_string(),
                prefix: "ledger".to_string(),
                access_key_id: "ak".to_string(),
                secret_access_key: None,
                clear_secret_access_key: None,
                force_path_style: true,
                e2ee_enabled: false,
                e2ee_passphrase: None,
                clear_e2ee_passphrase: Some(true),
                check_on_startup: true,
                sync_include_photos: None,
                sync_include_reports: None,
                sync_include_settings: None,
                sync_include_workbench: None,
                device_name: None,
            },
        )
        .unwrap();
        assert!(!cleared.e2ee_enabled);
        assert!(cleared.e2ee_passphrase.is_empty());
    }
}
