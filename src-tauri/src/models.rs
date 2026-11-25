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

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct WarningThreshold {
    pub id: String,
    pub days: i64,
    pub color: String,
    pub label: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppSettings {
    pub admin_username: String,
    pub warning_days: i64,
    pub warning_thresholds: Vec<WarningThreshold>,
    pub alert_popup_enabled: bool,
    pub alert_popup_frequency: String,
    pub alert_popup_interval_hours: i64,
    pub auto_lock_minutes: i64,
    pub doc_code: String,
    pub doc_version: String,
    pub doc_title: String,
    pub doc_subtitle: String,
    pub weekly_notice: String,
    pub github_repo: String,
    pub update_proxy_url: String,
    pub company_logo_path: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SettingsUpdateInput {
    pub warning_days: Option<i64>,
    pub warning_thresholds: Option<Vec<WarningThreshold>>,
    pub alert_popup_enabled: Option<bool>,
    pub alert_popup_frequency: Option<String>,
    pub alert_popup_interval_hours: Option<i64>,
    pub auto_lock_minutes: Option<i64>,
    pub doc_code: Option<String>,
    pub doc_version: Option<String>,
    pub doc_title: Option<String>,
    pub doc_subtitle: Option<String>,
    pub weekly_notice: Option<String>,
    pub github_repo: Option<String>,
    pub update_proxy_url: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AuthStatus {
    pub is_initialized: bool,
    pub is_admin: bool,
    pub username: String,
    pub is_locked: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupManifest {
    pub app_name: String,
    pub app_version: String,
    pub created_at: String,
    pub instrument_count: usize,
    pub report_count: usize,
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
pub struct DataDirInfo {
    pub data_dir: String,
    pub db_size_bytes: u64,
    pub attachments_size_bytes: u64,
    pub app_version: String,
}
