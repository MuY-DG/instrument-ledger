use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Instrument {
    pub id: i64,
    pub category: String, // "gauge" | "fixture"
    pub seq_no: i64,
    pub department: String,
    pub name: String,
    pub purchase_date: String,
    pub serial_no: String,
    pub model_spec: String,
    pub location: String,
    pub calibration_type: String, // "internal" | "external" | "exempt"
    pub record_type: String,
    pub last_cal_date: String,
    pub cal_cycle_months: i64,
    pub next_cal_date: String,
    pub exempt_calibration: bool,
    pub remark: String,
    pub supplier: String,
    pub contact_person: String,
    pub contact_phone: String,
    pub cal_agency: String,
    pub photo_path: String,
    pub report_count: i64,
    pub latest_report_id: Option<i64>,
    pub latest_report_name: Option<String>,
    pub latest_report_ext: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InstrumentInput {
    pub category: String,
    pub seq_no: Option<i64>,
    pub department: String,
    pub name: String,
    pub purchase_date: String,
    pub serial_no: String,
    pub model_spec: String,
    pub location: String,
    pub calibration_type: String,
    pub record_type: String,
    pub last_cal_date: String,
    pub cal_cycle_months: i64,
    pub next_cal_date: Option<String>,
    pub exempt_calibration: bool,
    pub remark: String,
    pub supplier: String,
    pub contact_person: String,
    pub contact_phone: String,
    pub cal_agency: String,
    pub photo_source_path: Option<String>,
    pub photo_base64: Option<String>,
    pub photo_filename: Option<String>,
    pub remove_photo: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CalibrationReport {
    pub id: i64,
    pub instrument_id: i64,
    pub file_name: String,
    pub stored_path: String,
    pub file_ext: String,
    pub file_size: i64,
    pub cal_date: String,
    pub cal_agency: String,
    pub remark: String,
    pub uploaded_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AddReportInput {
    pub instrument_id: i64,
    pub source_path: Option<String>,
    pub file_base64: Option<String>,
    pub file_name: Option<String>,
    pub cal_date: String,
    pub cal_agency: String,
    pub remark: String,
    pub sync_instrument_cal_date: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportResult {
    pub imported_count: usize,
    pub gauge_count: usize,
    pub fixture_count: usize,
    pub mode: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BatchUpdateInstrumentsInput {
    pub ids: Vec<i64>,
    pub category: Option<String>,
    pub department: Option<String>,
    pub location: Option<String>,
    pub calibration_type: Option<String>,
    pub exempt_calibration: Option<bool>,
    pub last_cal_date: Option<String>,
    pub cal_cycle_months: Option<i64>,
    pub cal_agency: Option<String>,
    /// "replace" | "append" | "clear"
    pub remark_mode: Option<String>,
    pub remark: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BatchOperationResult {
    pub affected_count: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct WarningThreshold {
    pub id: String,
    pub days: i64,
    pub color: String,
    pub label: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct CustomAppIcon {
    pub id: String,
    pub name: String,
    pub stored_path: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppearancePreferencesInput {
    pub close_behavior: Option<String>,
    pub show_tray_icon: Option<bool>,
    pub ui_language: Option<String>,
    pub ui_scale_mode: Option<String>,
    pub ui_scale: Option<f64>,
    pub app_icon_id: Option<String>,
    pub compact_toolbar: Option<bool>,
    pub show_import_button: Option<bool>,
    pub sidebar_nav_config: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppSettings {
    pub admin_username: String,
    pub admin_title: String,
    pub admin_avatar_path: String,
    pub warning_days: i64,
    pub warning_thresholds: Vec<WarningThreshold>,
    pub alert_popup_enabled: bool,
    pub alert_popup_frequency: String,
    pub alert_popup_interval_hours: i64,
    pub auto_lock_minutes: i64,
    pub close_behavior: String,
    pub show_tray_icon: bool,
    pub ui_language: String,
    pub ui_scale_mode: String,
    pub ui_scale: f64,
    pub app_icon_id: String,
    pub custom_app_icons: Vec<CustomAppIcon>,
    pub compact_toolbar: bool,
    pub show_import_button: bool,
    pub sidebar_nav_config: String,
    pub keep_admin_session: bool,
    pub admin_session_days: i64,
    pub app_lock_enabled: bool,
    pub app_lock_pin_length: usize,
    pub lock_on_hide: bool,
    pub lock_on_startup: bool,
    pub doc_code: String,
    pub doc_version: String,
    pub doc_title: String,
    pub doc_subtitle: String,
    pub weekly_notice: String,
    pub github_repo: String,
    pub update_proxy_url: String,
    pub company_logo_path: String,
    pub workbench_cache_limit_mb: i64,
    pub backup_include_photos: bool,
    pub backup_include_reports: bool,
    pub backup_include_settings: bool,
    pub backup_include_workbench: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SettingsUpdateInput {
    pub admin_username: Option<String>,
    pub admin_title: Option<String>,
    pub warning_days: Option<i64>,
    pub warning_thresholds: Option<Vec<WarningThreshold>>,
    pub alert_popup_enabled: Option<bool>,
    pub alert_popup_frequency: Option<String>,
    pub alert_popup_interval_hours: Option<i64>,
    pub auto_lock_minutes: Option<i64>,
    pub close_behavior: Option<String>,
    pub show_tray_icon: Option<bool>,
    pub ui_language: Option<String>,
    pub ui_scale_mode: Option<String>,
    pub ui_scale: Option<f64>,
    pub app_icon_id: Option<String>,
    pub compact_toolbar: Option<bool>,
    pub show_import_button: Option<bool>,
    pub sidebar_nav_config: Option<String>,
    pub keep_admin_session: Option<bool>,
    pub admin_session_days: Option<i64>,
    pub lock_on_hide: Option<bool>,
    pub lock_on_startup: Option<bool>,
    pub doc_code: Option<String>,
    pub doc_version: Option<String>,
    pub doc_title: Option<String>,
    pub doc_subtitle: Option<String>,
    pub weekly_notice: Option<String>,
    pub github_repo: Option<String>,
    pub update_proxy_url: Option<String>,
    pub workbench_cache_limit_mb: Option<i64>,
    pub backup_include_photos: Option<bool>,
    pub backup_include_reports: Option<bool>,
    pub backup_include_settings: Option<bool>,
    pub backup_include_workbench: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AuthStatus {
    pub is_initialized: bool,
    pub is_admin: bool,
    pub username: String,
    pub is_locked: bool,
    pub app_lock_enabled: bool,
    pub app_lock_pin_length: usize,
    pub admin_session_expires_at: Option<String>,
}

fn default_true_flag() -> bool {
    true
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupManifest {
    pub app_name: String,
    pub app_version: String,
    pub created_at: String,
    pub instrument_count: usize,
    pub report_count: usize,
    #[serde(default = "default_true_flag")]
    pub include_photos: bool,
    #[serde(default = "default_true_flag")]
    pub include_reports: bool,
    #[serde(default = "default_true_flag")]
    pub include_settings: bool,
    #[serde(default)]
    pub include_workbench: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupResult {
    pub path: String,
    pub size_bytes: u64,
    pub instrument_count: usize,
    pub report_count: usize,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RestoreResult {
    pub instrument_count: usize,
    pub report_count: usize,
    pub restored_from: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ResetAppResult {
    pub backup: Option<BackupResult>,
    pub auth: AuthStatus,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateCheckResult {
    pub has_update: bool,
    pub current_version: String,
    pub latest_version: String,
    pub release_notes: String,
    pub published_at: String,
    pub download_url: String,
    pub html_url: String,
    pub asset_name: String,
    pub asset_size: u64,
    pub resolved_source: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateDownloadProgress {
    pub downloaded: u64,
    pub total: u64,
    pub percent: f64,
    pub phase: String,
    pub message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReleaseHistoryItem {
    pub version: String,
    pub tag_name: String,
    pub name: String,
    pub published_at: String,
    pub body: String,
    pub html_url: String,
    pub prerelease: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DataDirInfo {
    pub data_dir: String,
    pub db_size_bytes: u64,
    pub attachments_size_bytes: u64,
    pub workbench_cache_bytes: u64,
    pub workbench_draft_count: usize,
    pub workbench_cache_limit_mb: i64,
    pub instrument_count: usize,
    pub report_count: usize,
    pub app_version: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncConfigView {
    pub enabled: bool,
    pub configured: bool,
    pub provider_preset: String,
    pub endpoint: String,
    pub region: String,
    pub bucket: String,
    pub prefix: String,
    pub access_key_id: String,
    pub has_secret_access_key: bool,
    pub secret_access_key_hint: String,
    pub force_path_style: bool,
    pub e2ee_enabled: bool,
    pub has_e2ee_passphrase: bool,
    pub check_on_startup: bool,
    pub sync_include_photos: bool,
    pub sync_include_reports: bool,
    pub sync_include_settings: bool,
    pub sync_include_workbench: bool,
    pub device_id: String,
    pub device_name: String,
    pub last_synced_rev: u64,
    pub last_synced_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveSyncConfigInput {
    pub enabled: bool,
    pub provider_preset: String,
    pub endpoint: String,
    pub region: String,
    pub bucket: String,
    pub prefix: String,
    pub access_key_id: String,
    pub secret_access_key: Option<String>,
    pub clear_secret_access_key: Option<bool>,
    pub force_path_style: bool,
    pub e2ee_enabled: bool,
    pub e2ee_passphrase: Option<String>,
    pub clear_e2ee_passphrase: Option<bool>,
    pub check_on_startup: bool,
    pub sync_include_photos: Option<bool>,
    pub sync_include_reports: Option<bool>,
    pub sync_include_settings: Option<bool>,
    pub sync_include_workbench: Option<bool>,
    pub device_name: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TestSyncConfigInput {
    pub endpoint: String,
    pub region: String,
    pub bucket: String,
    pub prefix: String,
    pub access_key_id: String,
    pub secret_access_key: Option<String>,
    pub force_path_style: bool,
    pub e2ee_enabled: bool,
    pub e2ee_passphrase: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncTestResult {
    pub ok: bool,
    pub message: String,
    pub has_remote_data: bool,
    pub remote_revision: Option<u64>,
    pub remote_instrument_count: Option<usize>,
    pub remote_report_count: Option<usize>,
    pub remote_updated_at: Option<String>,
    pub remote_device_name: Option<String>,
    pub remote_encrypted: bool,
    pub passphrase_verified: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncStatusResult {
    pub configured: bool,
    pub enabled: bool,
    /// "unconfigured" | "disabled" | "up_to_date" | "local_ahead" | "remote_ahead" | "conflict"
    pub state: String,
    pub summary: String,
    pub local_instrument_count: usize,
    pub local_report_count: usize,
    pub local_changed: bool,
    pub last_synced_rev: u64,
    pub last_synced_at: String,
    pub remote_revision: Option<u64>,
    pub remote_updated_at: Option<String>,
    pub remote_device_name: Option<String>,
    pub remote_instrument_count: Option<usize>,
    pub remote_report_count: Option<usize>,
    pub remote_encrypted: bool,
    pub local_e2ee_enabled: bool,
    pub encryption_mismatch: bool,
    pub passphrase_error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncActionResult {
    /// "push" | "pull" | "noop"
    pub direction: String,
    pub revision: u64,
    pub instrument_count: usize,
    pub report_count: usize,
    pub transferred_blobs: usize,
    pub skipped_blobs: usize,
    pub db_bytes: u64,
    pub encrypted: bool,
    pub synced_at: String,
    pub safety_backup_path: Option<String>,
    pub message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncProgressEvent {
    pub phase: String,
    pub message: String,
    pub current: usize,
    pub total: usize,
    pub percent: f64,
}
