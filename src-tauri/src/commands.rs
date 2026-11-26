use std::fs;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;

use base64::Engine;
use chrono::{Duration, Utc};
use rusqlite::{params, Connection};
use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager, State};
use tauri_plugin_opener::OpenerExt;

use crate::auth::{hash_password, validate_pin, verify_password, SessionState};
use crate::backup::{create_backup, reset_app_data_with_backup, restore_backup};
use crate::db::{
    calc_next_cal_date, get_setting, is_account_initialized, is_app_lock_configured,
    load_app_settings, now_iso, query_instrument_by_id, query_instruments,
    query_reports_for_instrument, sanitize_admin_session_days, sanitize_close_behavior,
    sanitize_popup_frequency, sanitize_warning_thresholds, set_setting,
    DEFAULT_ADMIN_SESSION_DAYS, DEFAULT_ADMIN_TITLE, DEFAULT_GITHUB_REPO,
};
use crate::models::{
    AddReportInput, AppSettings, AuthStatus, BackupResult, CalibrationReport, DataDirInfo,
    ImportResult, Instrument, InstrumentInput, ResetAppResult, RestoreResult, SettingsUpdateInput,
    UpdateCheckResult,
};
use crate::storage::{
    dir_total_size, mime_from_ext, remove_stored_file, resolve_stored_path, save_image_from_base64,
    save_image_from_path, save_report_from_base64, save_report_from_path,
};
use crate::updater::{check_github_release, download_and_install_update, PendingUpdate};

pub struct AppState {
    pub db: Mutex<Connection>,
    pub session: Mutex<SessionState>,
    pub pending_update: Mutex<Option<PendingUpdate>>,
    pub allow_exit: AtomicBool,
    pub data_dir: PathBuf,
    pub db_path: PathBuf,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Base64FilePayload {
    pub mime: String,
    pub base64: String,
    pub file_name: String,
    pub size: usize,
}

fn check_unlocked(state: &State<'_, AppState>) -> Result<(), String> {
    let session = state.session.lock().map_err(|_| "状态锁异常".to_string())?;
    if session.is_locked {
        return Err("应用当前处于锁屏保护状态".to_string());
    }
    Ok(())
}

fn check_admin(state: &State<'_, AppState>) -> Result<(), String> {
    let mut session = state.session.lock().map_err(|_| "状态锁异常".to_string())?;
    if session.check_and_expire() {
        if let Ok(conn) = state.db.lock() {
            let _ = set_setting(&conn, "admin_session_active", "0");
            let _ = set_setting(&conn, "admin_session_expires_at", "");
        }
        return Err("管理员登录已过期，请重新登录".to_string());
    }
    session.require_admin()
}

pub fn build_auth_status(conn: &Connection, session: &SessionState) -> Result<AuthStatus, String> {
    let initialized = is_account_initialized(conn)?;
    let username = if initialized {
        get_setting(conn, "admin_username")?.unwrap_or_default()
    } else {
        String::new()
    };
    let (app_lock_enabled, app_lock_pin_length) = if initialized {
        is_app_lock_configured(conn)?
    } else {
        (false, 0)
    };
    let is_admin = initialized && session.is_admin;

    Ok(AuthStatus {
        is_initialized: initialized,
        is_admin,
        username,
        is_locked: initialized && app_lock_enabled && session.is_locked,
        app_lock_enabled,
        app_lock_pin_length,
        admin_session_expires_at: if is_admin {
            session.admin_expires_at.map(|dt| dt.to_rfc3339())
        } else {
            None
        },
    })
}

fn emit_auth_status(app: &AppHandle, status: &AuthStatus) {
    let _ = app.emit("auth-status-changed", status);
}

pub fn show_main_window(app: &AppHandle) {
    let state = app.state::<AppState>();
    let expired_status = (|| -> Option<AuthStatus> {
        let mut session = state.session.lock().ok()?;
        if !session.check_and_expire() {
            return None;
        }
        let conn = state.db.lock().ok()?;
        let _ = set_setting(&conn, "admin_session_active", "0");
        let _ = set_setting(&conn, "admin_session_expires_at", "");
        build_auth_status(&conn, &session).ok()
    })();
    if let Some(status) = expired_status {
        emit_auth_status(app, &status);
    }

    if let Some(window) = app.get_webview_window("main") {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
        let _ = window.emit("window-shown", ());
    }
}

pub fn hide_main_window_and_maybe_lock(app: &AppHandle) {
    let state = app.state::<AppState>();
    let maybe_locked_status = (|| -> Option<AuthStatus> {
        let conn = state.db.lock().ok()?;
        let initialized = is_account_initialized(&conn).ok()?;
        if !initialized {
            return None;
        }
        let (app_lock_enabled, _) = is_app_lock_configured(&conn).ok()?;
        let lock_on_hide = get_setting(&conn, "lock_on_hide").ok()?.as_deref() == Some("1");
        if app_lock_enabled && lock_on_hide {
            let mut session = state.session.lock().ok()?;
            session.is_locked = true;
            let _ = set_setting(&conn, "app_lock_active", "1");
            return build_auth_status(&conn, &session).ok();
        }
        None
    })();

    if let Some(status) = maybe_locked_status {
        emit_auth_status(app, &status);
    }

    if let Some(window) = app.get_webview_window("main") {
        let _ = window.hide();
    }
}

pub fn lock_app_from_tray(app: &AppHandle) {
    let state = app.state::<AppState>();
    let result = (|| -> Result<Option<AuthStatus>, String> {
        let conn = state.db.lock().map_err(|_| "数据库锁异常".to_string())?;
        if !is_account_initialized(&conn)? {
            return Ok(None);
        }
        let (app_lock_enabled, _) = is_app_lock_configured(&conn)?;
        if !app_lock_enabled {
            return Ok(None);
        }
        let mut session = state.session.lock().map_err(|_| "状态锁异常".to_string())?;
        session.is_locked = true;
        set_setting(&conn, "app_lock_active", "1")?;
        let status = build_auth_status(&conn, &session)?;
        Ok(Some(status))
    })();

    match result {
        Ok(Some(status)) => {
            emit_auth_status(app, &status);
        }
        _ => {
            show_main_window(app);
            let _ = app.emit("open-app-lock-setup", ());
        }
    }
}

// ---------------- Auth & Lock ----------------

#[tauri::command]
pub fn get_auth_status(state: State<'_, AppState>) -> Result<AuthStatus, String> {
    let mut session = state.session.lock().map_err(|_| "状态锁异常".to_string())?;
    let conn = state.db.lock().map_err(|_| "数据库锁异常".to_string())?;
    if session.check_and_expire() {
        let _ = set_setting(&conn, "admin_session_active", "0");
        let _ = set_setting(&conn, "admin_session_expires_at", "");
    }
    build_auth_status(&conn, &session)
}

#[tauri::command]
pub fn setup_initial_admin(
    state: State<'_, AppState>,
    username: String,
    password: String,
    doc_title: Option<String>,
    doc_code: Option<String>,
) -> Result<AuthStatus, String> {
    let clean_user = username.trim().to_string();
    let user_len = clean_user.chars().count();
    if !(2..=32).contains(&user_len) {
        return Err("管理员用户名长度需在 2 到 32 个字符之间".to_string());
    }
    if password.chars().count() < 6 {
        return Err("管理员密码长度不能少于 6 位".to_string());
    }

    let conn = state.db.lock().map_err(|_| "数据库锁异常".to_string())?;
    if is_account_initialized(&conn)? {
        return Err("管理员账号已完成初始化，请直接登录".to_string());
    }

    let pwd_hash = hash_password(&password)?;
    let expires_at = Utc::now() + Duration::days(DEFAULT_ADMIN_SESSION_DAYS);
    set_setting(&conn, "admin_username", &clean_user)?;
    set_setting(&conn, "admin_password_hash", &pwd_hash)?;
    set_setting(&conn, "account_initialized", "1")?;
    set_setting(&conn, "must_change_password", "0")?;
    set_setting(&conn, "keep_admin_session", "1")?;
    set_setting(
        &conn,
        "admin_session_days",
        &DEFAULT_ADMIN_SESSION_DAYS.to_string(),
    )?;
    set_setting(&conn, "admin_session_active", "1")?;
    set_setting(&conn, "admin_session_expires_at", &expires_at.to_rfc3339())?;

    if let Some(title) = doc_title {
        let t = title.trim();
        if !t.is_empty() {
            set_setting(&conn, "doc_title", t)?;
        }
    }
    if let Some(code) = doc_code {
        let c = code.trim();
        if !c.is_empty() {
            set_setting(&conn, "doc_code", c)?;
        }
    }

    let mut session = state.session.lock().map_err(|_| "状态锁异常".to_string())?;
    session.is_admin = true;
    session.is_locked = false;
    session.admin_expires_at = Some(expires_at);

    build_auth_status(&conn, &session)
}

#[tauri::command]
pub fn admin_login(
    state: State<'_, AppState>,
    username: String,
    password: String,
    remember: Option<bool>,
    remember_days: Option<i64>,
) -> Result<AuthStatus, String> {
    let conn = state.db.lock().map_err(|_| "数据库锁异常".to_string())?;
    if !is_account_initialized(&conn)? {
        return Err("管理员账号尚未初始化，请先完成首次安装向导".to_string());
    }
    let stored_user = get_setting(&conn, "admin_username")?.unwrap_or_default();
    let stored_hash = get_setting(&conn, "admin_password_hash")?
        .ok_or_else(|| "管理员密码未初始化".to_string())?;

    if username.trim() != stored_user || !verify_password(&password, &stored_hash) {
        return Err("账号或密码错误".to_string());
    }

    let keep = match remember {
        Some(flag) => {
            set_setting(&conn, "keep_admin_session", if flag { "1" } else { "0" })?;
            flag
        }
        None => get_setting(&conn, "keep_admin_session")?.as_deref() != Some("0"),
    };

    let days = match remember_days {
        Some(d) => {
            let clean = sanitize_admin_session_days(d);
            set_setting(&conn, "admin_session_days", &clean.to_string())?;
            clean
        }
        None => get_setting(&conn, "admin_session_days")?
            .and_then(|s| s.parse::<i64>().ok())
            .map(sanitize_admin_session_days)
            .unwrap_or(DEFAULT_ADMIN_SESSION_DAYS),
    };

    let expires_at = if keep {
        let exp = Utc::now() + Duration::days(days);
        set_setting(&conn, "admin_session_active", "1")?;
        set_setting(&conn, "admin_session_expires_at", &exp.to_rfc3339())?;
        Some(exp)
    } else {
        set_setting(&conn, "admin_session_active", "0")?;
        set_setting(&conn, "admin_session_expires_at", "")?;
        None
    };

    let mut session = state.session.lock().map_err(|_| "状态锁异常".to_string())?;
    session.is_admin = true;
    session.admin_expires_at = expires_at;

    build_auth_status(&conn, &session)
}

#[tauri::command]
pub fn admin_logout(state: State<'_, AppState>) -> Result<AuthStatus, String> {
    let conn = state.db.lock().map_err(|_| "数据库锁异常".to_string())?;
    set_setting(&conn, "admin_session_active", "0")?;
    set_setting(&conn, "admin_session_expires_at", "")?;

    let mut session = state.session.lock().map_err(|_| "状态锁异常".to_string())?;
    session.is_admin = false;
    session.admin_expires_at = None;

    build_auth_status(&conn, &session)
}

#[tauri::command]
pub fn configure_app_lock(
    app: AppHandle,
    state: State<'_, AppState>,
    pin: String,
    auto_lock_minutes: Option<i64>,
    lock_on_hide: Option<bool>,
    lock_on_startup: Option<bool>,
) -> Result<AuthStatus, String> {
    check_admin(&state)?;
    let pin_len = validate_pin(&pin)?;
    let pin_hash = hash_password(&pin)?;

    let conn = state.db.lock().map_err(|_| "数据库锁异常".to_string())?;
    set_setting(&conn, "app_lock_pin_hash", &pin_hash)?;
    set_setting(&conn, "app_lock_pin_length", &pin_len.to_string())?;
    set_setting(&conn, "app_lock_enabled", "1")?;

    if let Some(m) = auto_lock_minutes {
        set_setting(&conn, "auto_lock_minutes", &m.clamp(0, 240).to_string())?;
    }
    if let Some(v) = lock_on_hide {
        set_setting(&conn, "lock_on_hide", if v { "1" } else { "0" })?;
    }
    if let Some(v) = lock_on_startup {
        set_setting(&conn, "lock_on_startup", if v { "1" } else { "0" })?;
    }

    let session = state.session.lock().map_err(|_| "状态锁异常".to_string())?;
    let status = build_auth_status(&conn, &session)?;
    emit_auth_status(&app, &status);
    Ok(status)
}

#[tauri::command]
pub fn disable_app_lock(app: AppHandle, state: State<'_, AppState>) -> Result<AuthStatus, String> {
    check_admin(&state)?;
    let conn = state.db.lock().map_err(|_| "数据库锁异常".to_string())?;
    set_setting(&conn, "app_lock_enabled", "0")?;
    set_setting(&conn, "app_lock_pin_hash", "")?;
    set_setting(&conn, "app_lock_pin_length", "0")?;
    set_setting(&conn, "app_lock_active", "0")?;

    let mut session = state.session.lock().map_err(|_| "状态锁异常".to_string())?;
    session.is_locked = false;
    let status = build_auth_status(&conn, &session)?;
    emit_auth_status(&app, &status);
    Ok(status)
}

#[tauri::command]
pub fn lock_app(app: AppHandle, state: State<'_, AppState>) -> Result<AuthStatus, String> {
    let conn = state.db.lock().map_err(|_| "数据库锁异常".to_string())?;
    if !is_account_initialized(&conn)? {
        return Err("请先完成管理员账号初始化后再启用应用锁".to_string());
    }
    let (app_lock_enabled, _) = is_app_lock_configured(&conn)?;
    if !app_lock_enabled {
        return Err("应用锁尚未开启，请先设置 4~6 位独立 PIN 码".to_string());
    }
    let mut session = state.session.lock().map_err(|_| "状态锁异常".to_string())?;
    session.is_locked = true;
    set_setting(&conn, "app_lock_active", "1")?;

    let status = build_auth_status(&conn, &session)?;
    emit_auth_status(&app, &status);
    Ok(status)
}

#[tauri::command]
pub fn unlock_app(
    app: AppHandle,
    state: State<'_, AppState>,
    pin: String,
) -> Result<AuthStatus, String> {
    let conn = state.db.lock().map_err(|_| "数据库锁异常".to_string())?;
    if !is_account_initialized(&conn)? {
        return Err("管理员账号尚未初始化".to_string());
    }
    let stored_hash = get_setting(&conn, "app_lock_pin_hash")?.unwrap_or_default();
    if stored_hash.trim().is_empty() {
        return Err("应用锁未配置 PIN 码，请使用管理员密码解锁".to_string());
    }
    if !verify_password(&pin, &stored_hash) {
        return Err("PIN 码错误，请重试".to_string());
    }

    let mut session = state.session.lock().map_err(|_| "状态锁异常".to_string())?;
    session.is_locked = false;
    set_setting(&conn, "app_lock_active", "0")?;

    let status = build_auth_status(&conn, &session)?;
    emit_auth_status(&app, &status);
    Ok(status)
}

#[tauri::command]
pub fn unlock_app_with_admin(
    app: AppHandle,
    state: State<'_, AppState>,
    admin_password: String,
    new_pin: Option<String>,
    disable_lock: Option<bool>,
) -> Result<AuthStatus, String> {
    let conn = state.db.lock().map_err(|_| "数据库锁异常".to_string())?;
    if !is_account_initialized(&conn)? {
        return Err("管理员账号尚未初始化".to_string());
    }
    let stored_hash = get_setting(&conn, "admin_password_hash")?
        .ok_or_else(|| "管理员密码未初始化".to_string())?;
    if !verify_password(&admin_password, &stored_hash) {
        return Err("管理员密码错误".to_string());
    }

    if disable_lock == Some(true) {
        set_setting(&conn, "app_lock_enabled", "0")?;
        set_setting(&conn, "app_lock_pin_hash", "")?;
        set_setting(&conn, "app_lock_pin_length", "0")?;
    } else if let Some(pin) = new_pin {
        if !pin.is_empty() {
            let pin_len = validate_pin(&pin)?;
            let pin_hash = hash_password(&pin)?;
            set_setting(&conn, "app_lock_pin_hash", &pin_hash)?;
            set_setting(&conn, "app_lock_pin_length", &pin_len.to_string())?;
            set_setting(&conn, "app_lock_enabled", "1")?;
        }
    }

    let mut session = state.session.lock().map_err(|_| "状态锁异常".to_string())?;
    session.is_locked = false;
    set_setting(&conn, "app_lock_active", "0")?;

    let status = build_auth_status(&conn, &session)?;
    emit_auth_status(&app, &status);
    Ok(status)
}

#[tauri::command]
pub fn perform_close_action(
    app: AppHandle,
    state: State<'_, AppState>,
    action: String,
    remember: bool,
) -> Result<(), String> {
    let normalized = match action.trim() {
        "exit" => "exit",
        _ => "minimize_to_tray",
    };
    if remember {
        let conn = state.db.lock().map_err(|_| "数据库锁异常".to_string())?;
        set_setting(&conn, "close_behavior", normalized)?;
    }
    if normalized == "exit" {
        state.allow_exit.store(true, Ordering::SeqCst);
        app.exit(0);
    } else {
        hide_main_window_and_maybe_lock(&app);
    }
    Ok(())
}

#[tauri::command]
pub fn set_close_behavior(
    state: State<'_, AppState>,
    close_behavior: String,
) -> Result<AppSettings, String> {
    check_unlocked(&state)?;
    let conn = state.db.lock().map_err(|_| "数据库锁异常".to_string())?;
    set_setting(&conn, "close_behavior", &sanitize_close_behavior(&close_behavior))?;
    load_app_settings(&conn)
}

#[tauri::command]
pub fn change_admin_password(
    state: State<'_, AppState>,
    old_password: String,
    new_password: String,
    new_username: Option<String>,
) -> Result<(), String> {
    check_admin(&state)?;
    if new_password.chars().count() < 6 {
        return Err("新密码长度不能少于 6 位".to_string());
    }
    let conn = state.db.lock().map_err(|_| "数据库锁异常".to_string())?;
    let stored_hash = get_setting(&conn, "admin_password_hash")?
        .ok_or_else(|| "管理员密码未初始化".to_string())?;
    if !verify_password(&old_password, &stored_hash) {
        return Err("原密码不正确".to_string());
    }
    let new_hash = hash_password(&new_password)?;
    set_setting(&conn, "admin_password_hash", &new_hash)?;
    set_setting(&conn, "account_initialized", "1")?;
    set_setting(&conn, "must_change_password", "0")?;
    if let Some(u) = new_username {
        let trimmed = u.trim();
        let len = trimmed.chars().count();
        if (2..=32).contains(&len) {
            set_setting(&conn, "admin_username", trimmed)?;
        }
    }
    Ok(())
}

// ---------------- Instruments CRUD ----------------

#[tauri::command]
pub fn list_instruments(state: State<'_, AppState>) -> Result<Vec<Instrument>, String> {
    check_unlocked(&state)?;
    let conn = state.db.lock().map_err(|_| "数据库锁异常".to_string())?;
    query_instruments(&conn)
}

#[tauri::command]
pub fn create_instrument(
    state: State<'_, AppState>,
    input: InstrumentInput,
) -> Result<Instrument, String> {
    check_admin(&state)?;
    if input.name.trim().is_empty() {
        return Err("仪器/检具名称不能为空".to_string());
    }

    let photo_path = if let Some(ref src) = input.photo_source_path {
        if !src.trim().is_empty() {
            save_image_from_path(&state.data_dir, Path::new(src.trim()))?
        } else {
            String::new()
        }
    } else if let Some(ref b64) = input.photo_base64 {
        if !b64.trim().is_empty() {
            save_image_from_base64(&state.data_dir, b64, input.photo_filename.as_deref())?
        } else {
            String::new()
        }
    } else {
        String::new()
    };

    let category = if input.category == "fixture" {
        "fixture"
    } else {
        "gauge"
    };

    let next_cal = if input.exempt_calibration {
        String::new()
    } else {
        let manual = input.next_cal_date.clone().unwrap_or_default();
        if !manual.trim().is_empty() {
            manual.trim().to_string()
        } else {
            calc_next_cal_date(&input.last_cal_date, input.cal_cycle_months)
        }
    };

    let conn = state.db.lock().map_err(|_| "数据库锁异常".to_string())?;
    let next_seq: i64 = match input.seq_no {
        Some(n) if n > 0 => n,
        _ => conn
            .query_row(
                "SELECT COALESCE(MAX(seq_no), 0) + 1 FROM instruments WHERE category = ?1",
                params![category],
                |r| r.get(0),
            )
            .unwrap_or(1),
    };

    let now = now_iso();
    conn.execute(
        "INSERT INTO instruments (
            category, seq_no, department, name, purchase_date, serial_no, model_spec,
            location, calibration_type, record_type, last_cal_date, cal_cycle_months,
            next_cal_date, exempt_calibration, remark, supplier, contact_person,
            contact_phone, cal_agency, photo_path, created_at, updated_at
        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19, ?20, ?21, ?22)",
        params![
            category,
            next_seq,
            input.department.trim(),
            input.name.trim(),
            input.purchase_date.trim(),
            input.serial_no.trim(),
            input.model_spec.trim(),
            input.location.trim(),
            input.calibration_type.trim(),
            input.record_type.trim(),
            input.last_cal_date.trim(),
            input.cal_cycle_months,
            next_cal,
            if input.exempt_calibration { 1 } else { 0 },
            input.remark.trim(),
            input.supplier.trim(),
            input.contact_person.trim(),
            input.contact_phone.trim(),
            input.cal_agency.trim(),
            photo_path,
            now,
            now,
        ],
    )
    .map_err(|e| format!("新增仪器失败: {}", e))?;

    let new_id = conn.last_insert_rowid();
    query_instrument_by_id(&conn, new_id)
}

#[tauri::command]
pub fn update_instrument(
    state: State<'_, AppState>,
    id: i64,
    input: InstrumentInput,
) -> Result<Instrument, String> {
    check_admin(&state)?;
    if input.name.trim().is_empty() {
        return Err("仪器/检具名称不能为空".to_string());
    }

    let conn = state.db.lock().map_err(|_| "数据库锁异常".to_string())?;
    let existing = query_instrument_by_id(&conn, id)?;

    // Preserve original photo unless explicitly removed or replaced
    let mut final_photo_path = existing.photo_path.clone();
    if input.remove_photo.unwrap_or(false) {
        remove_stored_file(&state.data_dir, &existing.photo_path);
        final_photo_path.clear();
    } else if let Some(ref src) = input.photo_source_path {
        if !src.trim().is_empty() {
            let new_rel = save_image_from_path(&state.data_dir, Path::new(src.trim()))?;
            remove_stored_file(&state.data_dir, &existing.photo_path);
            final_photo_path = new_rel;
        }
    } else if let Some(ref b64) = input.photo_base64 {
        if !b64.trim().is_empty() {
            let new_rel =
                save_image_from_base64(&state.data_dir, b64, input.photo_filename.as_deref())?;
            remove_stored_file(&state.data_dir, &existing.photo_path);
            final_photo_path = new_rel;
        }
    }

    let category = if input.category == "fixture" {
        "fixture"
    } else {
        "gauge"
    };

    let next_cal = if input.exempt_calibration {
        String::new()
    } else {
        let manual = input.next_cal_date.clone().unwrap_or_default();
        if !manual.trim().is_empty() {
            manual.trim().to_string()
        } else {
            calc_next_cal_date(&input.last_cal_date, input.cal_cycle_months)
        }
    };

    let seq_no = input.seq_no.unwrap_or(existing.seq_no);
    let now = now_iso();

    conn.execute(
        "UPDATE instruments SET
            category = ?1, seq_no = ?2, department = ?3, name = ?4, purchase_date = ?5,
            serial_no = ?6, model_spec = ?7, location = ?8, calibration_type = ?9,
            record_type = ?10, last_cal_date = ?11, cal_cycle_months = ?12,
            next_cal_date = ?13, exempt_calibration = ?14, remark = ?15, supplier = ?16,
            contact_person = ?17, contact_phone = ?18, cal_agency = ?19, photo_path = ?20,
            updated_at = ?21
         WHERE id = ?22",
        params![
            category,
            seq_no,
            input.department.trim(),
            input.name.trim(),
            input.purchase_date.trim(),
            input.serial_no.trim(),
            input.model_spec.trim(),
            input.location.trim(),
            input.calibration_type.trim(),
            input.record_type.trim(),
            input.last_cal_date.trim(),
            input.cal_cycle_months,
            next_cal,
            if input.exempt_calibration { 1 } else { 0 },
            input.remark.trim(),
            input.supplier.trim(),
            input.contact_person.trim(),
            input.contact_phone.trim(),
            input.cal_agency.trim(),
            final_photo_path,
            now,
            id,
        ],
    )
    .map_err(|e| format!("更新仪器记录失败: {}", e))?;

    query_instrument_by_id(&conn, id)
}

#[tauri::command]
pub fn delete_instrument(state: State<'_, AppState>, id: i64) -> Result<(), String> {
    check_admin(&state)?;
    let conn = state.db.lock().map_err(|_| "数据库锁异常".to_string())?;
    let existing = query_instrument_by_id(&conn, id)?;
    let reports = query_reports_for_instrument(&conn, id)?;

    conn.execute("DELETE FROM instruments WHERE id = ?1", params![id])
        .map_err(|e| format!("删除仪器失败: {}", e))?;

    remove_stored_file(&state.data_dir, &existing.photo_path);
    for r in reports {
        remove_stored_file(&state.data_dir, &r.stored_path);
    }
    let inst_report_dir = state.data_dir.join("reports").join(id.to_string());
    let _ = fs::remove_dir_all(inst_report_dir);

    Ok(())
}

#[tauri::command]
pub fn batch_import_instruments(
    state: State<'_, AppState>,
    rows: Vec<InstrumentInput>,
    replace_existing: bool,
) -> Result<ImportResult, String> {
    check_admin(&state)?;
    let mut conn = state.db.lock().map_err(|_| "数据库锁异常".to_string())?;

    if replace_existing {
        // Also clean up old report/photo files if replacing entire ledger
        let old_instruments = query_instruments(&conn)?;
        for inst in &old_instruments {
            remove_stored_file(&state.data_dir, &inst.photo_path);
            let _ = fs::remove_dir_all(state.data_dir.join("reports").join(inst.id.to_string()));
        }
    }

    let tx = conn
        .transaction()
        .map_err(|e| format!("开启事务失败: {}", e))?;

    if replace_existing {
        tx.execute("DELETE FROM calibration_reports", [])
            .map_err(|e| format!("清空旧报告记录失败: {}", e))?;
        tx.execute("DELETE FROM instruments", [])
            .map_err(|e| format!("清空旧台账失败: {}", e))?;
    }

    let now = now_iso();
    let mut gauge_seq: i64 = tx
        .query_row(
            "SELECT COALESCE(MAX(seq_no), 0) FROM instruments WHERE category = 'gauge'",
            [],
            |r| r.get(0),
        )
        .unwrap_or(0);
    let mut fixture_seq: i64 = tx
        .query_row(
            "SELECT COALESCE(MAX(seq_no), 0) FROM instruments WHERE category = 'fixture'",
            [],
            |r| r.get(0),
        )
        .unwrap_or(0);

    let mut gauge_count = 0usize;
    let mut fixture_count = 0usize;

    {
        let mut stmt = tx
            .prepare(
                "INSERT INTO instruments (
                    category, seq_no, department, name, purchase_date, serial_no, model_spec,
                    location, calibration_type, record_type, last_cal_date, cal_cycle_months,
                    next_cal_date, exempt_calibration, remark, supplier, contact_person,
                    contact_phone, cal_agency, photo_path, created_at, updated_at
                ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19, '', ?20, ?21)",
            )
            .map_err(|e| format!("准备导入语句失败: {}", e))?;

        for row in rows {
            if row.name.trim().is_empty() {
                continue;
            }
            let is_fixture = row.category == "fixture";
            let category = if is_fixture { "fixture" } else { "gauge" };
            let seq = if is_fixture {
                fixture_seq += 1;
                fixture_count += 1;
                if replace_existing {
                    row.seq_no.filter(|&n| n > 0).unwrap_or(fixture_seq)
                } else {
                    fixture_seq
                }
            } else {
                gauge_seq += 1;
                gauge_count += 1;
                if replace_existing {
                    row.seq_no.filter(|&n| n > 0).unwrap_or(gauge_seq)
                } else {
                    gauge_seq
                }
            };

            let next_cal = if row.exempt_calibration {
                String::new()
            } else {
                let manual = row.next_cal_date.clone().unwrap_or_default();
                if !manual.trim().is_empty() {
                    manual.trim().to_string()
                } else {
                    calc_next_cal_date(&row.last_cal_date, row.cal_cycle_months)
                }
            };

            stmt.execute(params![
                category,
                seq,
                row.department.trim(),
                row.name.trim(),
                row.purchase_date.trim(),
                row.serial_no.trim(),
                row.model_spec.trim(),
                row.location.trim(),
                row.calibration_type.trim(),
                row.record_type.trim(),
                row.last_cal_date.trim(),
                row.cal_cycle_months,
                next_cal,
                if row.exempt_calibration { 1 } else { 0 },
                row.remark.trim(),
                row.supplier.trim(),
                row.contact_person.trim(),
                row.contact_phone.trim(),
                row.cal_agency.trim(),
                now,
                now,
            ])
            .map_err(|e| format!("导入行 [{}] 失败: {}", row.name, e))?;
        }
    }

    tx.commit().map_err(|e| format!("提交导入事务失败: {}", e))?;

    Ok(ImportResult {
        imported_count: gauge_count + fixture_count,
        gauge_count,
        fixture_count,
        mode: if replace_existing {
            "replace".to_string()
        } else {
            "append".to_string()
        },
    })
}

// ---------------- Calibration Report Attachments ----------------

#[tauri::command]
pub fn list_reports(
    state: State<'_, AppState>,
    instrument_id: i64,
) -> Result<Vec<CalibrationReport>, String> {
    check_unlocked(&state)?;
    let conn = state.db.lock().map_err(|_| "数据库锁异常".to_string())?;
    query_reports_for_instrument(&conn, instrument_id)
}

#[tauri::command]
pub fn add_report(
    state: State<'_, AppState>,
    input: AddReportInput,
) -> Result<CalibrationReport, String> {
    check_admin(&state)?;

    let (file_name, stored_path, file_ext, file_size) = if let Some(ref src) = input.source_path {
        if !src.trim().is_empty() {
            save_report_from_path(&state.data_dir, input.instrument_id, Path::new(src.trim()))?
        } else {
            return Err("请选择要上传的校验报告文件".to_string());
        }
    } else if let Some(ref b64) = input.file_base64 {
        let orig = input
            .file_name
            .as_deref()
            .unwrap_or("校准报告.pdf");
        save_report_from_base64(&state.data_dir, input.instrument_id, b64, orig)?
    } else {
        return Err("请选择要上传的校验报告文件".to_string());
    };

    let conn = state.db.lock().map_err(|_| "数据库锁异常".to_string())?;
    let instrument = query_instrument_by_id(&conn, input.instrument_id)?;
    let now = now_iso();

    conn.execute(
        "INSERT INTO calibration_reports (
            instrument_id, file_name, stored_path, file_ext, file_size,
            cal_date, cal_agency, remark, uploaded_at
         ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
        params![
            input.instrument_id,
            file_name,
            stored_path,
            file_ext,
            file_size,
            input.cal_date.trim(),
            input.cal_agency.trim(),
            input.remark.trim(),
            now,
        ],
    )
    .map_err(|e| format!("保存报告记录失败: {}", e))?;

    let report_id = conn.last_insert_rowid();

    // Optionally sync instrument calibration date & recalculate next calibration date
    if input.sync_instrument_cal_date && !input.cal_date.trim().is_empty() {
        let cycle = if instrument.cal_cycle_months > 0 {
            instrument.cal_cycle_months
        } else {
            12
        };
        let next_cal = calc_next_cal_date(input.cal_date.trim(), cycle);
        let agency = if !input.cal_agency.trim().is_empty() {
            input.cal_agency.trim().to_string()
        } else {
            instrument.cal_agency.clone()
        };
        conn.execute(
            "UPDATE instruments
             SET last_cal_date = ?1, next_cal_date = ?2, cal_agency = ?3,
                 exempt_calibration = 0, updated_at = ?4
             WHERE id = ?5",
            params![input.cal_date.trim(), next_cal, agency, now, input.instrument_id],
        )
        .map_err(|e| format!("同步更新仪器校验日期失败: {}", e))?;
    }

    Ok(CalibrationReport {
        id: report_id,
        instrument_id: input.instrument_id,
        file_name,
        stored_path,
        file_ext,
        file_size,
        cal_date: input.cal_date.trim().to_string(),
        cal_agency: input.cal_agency.trim().to_string(),
        remark: input.remark.trim().to_string(),
        uploaded_at: now,
    })
}

#[tauri::command]
pub fn delete_report(state: State<'_, AppState>, report_id: i64) -> Result<(), String> {
    check_admin(&state)?;
    let conn = state.db.lock().map_err(|_| "数据库锁异常".to_string())?;
    let stored_path: String = conn
        .query_row(
            "SELECT stored_path FROM calibration_reports WHERE id = ?1",
            params![report_id],
            |r| r.get(0),
        )
        .map_err(|e| format!("未找到该校验报告: {}", e))?;

    conn.execute("DELETE FROM calibration_reports WHERE id = ?1", params![report_id])
        .map_err(|e| format!("删除校验报告失败: {}", e))?;

    remove_stored_file(&state.data_dir, &stored_path);
    Ok(())
}

#[tauri::command]
pub fn open_report_external(
    app: AppHandle,
    state: State<'_, AppState>,
    report_id: i64,
) -> Result<(), String> {
    check_unlocked(&state)?;
    let conn = state.db.lock().map_err(|_| "数据库锁异常".to_string())?;
    let stored_path: String = conn
        .query_row(
            "SELECT stored_path FROM calibration_reports WHERE id = ?1",
            params![report_id],
            |r| r.get(0),
        )
        .map_err(|e| format!("未找到报告记录: {}", e))?;

    let full_path = resolve_stored_path(&state.data_dir, &stored_path)?;
    if !full_path.exists() {
        return Err("报告文件不存在，可能已被手动删除".to_string());
    }
    app.opener()
        .open_path(full_path.to_string_lossy().as_ref(), None::<&str>)
        .map_err(|e| format!("调用系统软件打开报告失败: {}", e))
}

#[tauri::command]
pub fn export_report_to_path(
    state: State<'_, AppState>,
    report_id: i64,
    dest_path: String,
) -> Result<(), String> {
    check_unlocked(&state)?;
    let conn = state.db.lock().map_err(|_| "数据库锁异常".to_string())?;
    let stored_path: String = conn
        .query_row(
            "SELECT stored_path FROM calibration_reports WHERE id = ?1",
            params![report_id],
            |r| r.get(0),
        )
        .map_err(|e| format!("未找到报告记录: {}", e))?;

    let full_path = resolve_stored_path(&state.data_dir, &stored_path)?;
    fs::copy(&full_path, Path::new(dest_path.trim()))
        .map_err(|e| format!("另存为报告失败: {}", e))?;
    Ok(())
}

// ---------------- Managed File & External File Helpers ----------------

#[tauri::command]
pub fn read_stored_file_base64(
    state: State<'_, AppState>,
    rel_path: String,
) -> Result<Base64FilePayload, String> {
    check_unlocked(&state)?;
    let full = resolve_stored_path(&state.data_dir, &rel_path)?;
    let bytes = fs::read(&full).map_err(|e| format!("读取本地文件失败: {}", e))?;
    let ext = full
        .extension()
        .and_then(|s| s.to_str())
        .unwrap_or("");
    let file_name = full
        .file_name()
        .and_then(|s| s.to_str())
        .unwrap_or("file")
        .to_string();

    Ok(Base64FilePayload {
        mime: mime_from_ext(ext).to_string(),
        size: bytes.len(),
        base64: base64::engine::general_purpose::STANDARD.encode(&bytes),
        file_name,
    })
}

#[tauri::command]
pub fn read_external_file_base64(
    state: State<'_, AppState>,
    path: String,
) -> Result<Base64FilePayload, String> {
    check_admin(&state)?;
    let p = Path::new(path.trim());
    let bytes = fs::read(p).map_err(|e| format!("读取文件失败: {}", e))?;
    let ext = p.extension().and_then(|s| s.to_str()).unwrap_or("");
    let file_name = p
        .file_name()
        .and_then(|s| s.to_str())
        .unwrap_or("file")
        .to_string();

    Ok(Base64FilePayload {
        mime: mime_from_ext(ext).to_string(),
        size: bytes.len(),
        base64: base64::engine::general_purpose::STANDARD.encode(&bytes),
        file_name,
    })
}

#[tauri::command]
pub fn write_external_file_base64(
    state: State<'_, AppState>,
    path: String,
    base64_data: String,
) -> Result<(), String> {
    check_unlocked(&state)?;
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(base64_data.trim())
        .map_err(|e| format!("解码导出数据失败: {}", e))?;
    let dest = Path::new(path.trim());
    if let Some(parent) = dest.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("创建目标目录失败: {}", e))?;
    }
    fs::write(dest, bytes).map_err(|e| format!("保存导出文件失败: {}", e))
}

// ---------------- Settings, Logo, Data Dir, Backup & Restore ----------------

#[tauri::command]
pub fn get_settings(state: State<'_, AppState>) -> Result<AppSettings, String> {
    let conn = state.db.lock().map_err(|_| "数据库锁异常".to_string())?;
    load_app_settings(&conn)
}

#[tauri::command]
pub fn update_settings(
    state: State<'_, AppState>,
    input: SettingsUpdateInput,
) -> Result<AppSettings, String> {
    check_admin(&state)?;
    let conn = state.db.lock().map_err(|_| "数据库锁异常".to_string())?;
    if let Some(u) = input.admin_username {
        let trimmed = u.trim();
        let len = trimmed.chars().count();
        if !(2..=32).contains(&len) {
            return Err("用户名长度需在 2 到 32 个字符之间".to_string());
        }
        set_setting(&conn, "admin_username", trimmed)?;
    }
    if let Some(t) = input.admin_title {
        let trimmed = t.trim();
        let final_title: String = if trimmed.is_empty() {
            DEFAULT_ADMIN_TITLE.to_string()
        } else {
            trimmed.chars().take(24).collect()
        };
        set_setting(&conn, "admin_title", &final_title)?;
    }
    if let Some(w) = input.warning_days {
        set_setting(&conn, "warning_days", &w.clamp(1, 3650).to_string())?;
    }
    if let Some(thresholds) = input.warning_thresholds {
        let cleaned = sanitize_warning_thresholds(thresholds);
        let max_days = cleaned.iter().map(|t| t.days).max().unwrap_or(60);
        let serialized = serde_json::to_string(&cleaned)
            .map_err(|e| format!("序列化预警阈值失败: {}", e))?;
        set_setting(&conn, "warning_thresholds", &serialized)?;
        set_setting(&conn, "warning_days", &max_days.to_string())?;
    }
    if let Some(enabled) = input.alert_popup_enabled {
        set_setting(&conn, "alert_popup_enabled", if enabled { "1" } else { "0" })?;
    }
    if let Some(freq) = input.alert_popup_frequency {
        set_setting(&conn, "alert_popup_frequency", &sanitize_popup_frequency(&freq))?;
    }
    if let Some(hours) = input.alert_popup_interval_hours {
        set_setting(
            &conn,
            "alert_popup_interval_hours",
            &hours.clamp(1, 168).to_string(),
        )?;
    }
    if let Some(m) = input.auto_lock_minutes {
        set_setting(&conn, "auto_lock_minutes", &m.clamp(0, 240).to_string())?;
    }
    if let Some(behavior) = input.close_behavior {
        set_setting(&conn, "close_behavior", &sanitize_close_behavior(&behavior))?;
    }
    if let Some(days) = input.admin_session_days {
        set_setting(
            &conn,
            "admin_session_days",
            &sanitize_admin_session_days(days).to_string(),
        )?;
    }
    if let Some(keep) = input.keep_admin_session {
        set_setting(&conn, "keep_admin_session", if keep { "1" } else { "0" })?;
        if !keep {
            set_setting(&conn, "admin_session_active", "0")?;
            set_setting(&conn, "admin_session_expires_at", "")?;
            if let Ok(mut s) = state.session.lock() {
                s.admin_expires_at = None;
            }
        }
    }
    if let Some(v) = input.lock_on_hide {
        set_setting(&conn, "lock_on_hide", if v { "1" } else { "0" })?;
    }
    if let Some(v) = input.lock_on_startup {
        set_setting(&conn, "lock_on_startup", if v { "1" } else { "0" })?;
    }
    if let Some(v) = input.doc_code {
        set_setting(&conn, "doc_code", v.trim())?;
    }
    if let Some(v) = input.doc_version {
        set_setting(&conn, "doc_version", v.trim())?;
    }
    if let Some(v) = input.doc_title {
        set_setting(&conn, "doc_title", v.trim())?;
    }
    if let Some(v) = input.doc_subtitle {
        set_setting(&conn, "doc_subtitle", v.trim())?;
    }
    if let Some(v) = input.weekly_notice {
        set_setting(&conn, "weekly_notice", v.trim())?;
    }
    if let Some(v) = input.github_repo {
        set_setting(&conn, "github_repo", v.trim())?;
    }
    if let Some(v) = input.update_proxy_url {
        set_setting(&conn, "update_proxy_url", v.trim())?;
    }
    load_app_settings(&conn)
}

#[tauri::command]
pub fn upload_company_logo(
    state: State<'_, AppState>,
    source_path: String,
) -> Result<String, String> {
    check_admin(&state)?;
    let new_rel = save_image_from_path(&state.data_dir, Path::new(source_path.trim()))?;
    let conn = state.db.lock().map_err(|_| "数据库锁异常".to_string())?;
    if let Ok(Some(old)) = get_setting(&conn, "company_logo_path") {
        remove_stored_file(&state.data_dir, &old);
    }
    set_setting(&conn, "company_logo_path", &new_rel)?;
    Ok(new_rel)
}

#[tauri::command]
pub fn remove_company_logo(state: State<'_, AppState>) -> Result<(), String> {
    check_admin(&state)?;
    let conn = state.db.lock().map_err(|_| "数据库锁异常".to_string())?;
    if let Ok(Some(old)) = get_setting(&conn, "company_logo_path") {
        remove_stored_file(&state.data_dir, &old);
    }
    set_setting(&conn, "company_logo_path", "")?;
    Ok(())
}

#[tauri::command]
pub fn upload_admin_avatar(
    state: State<'_, AppState>,
    source_path: String,
) -> Result<String, String> {
    check_admin(&state)?;
    let new_rel = save_image_from_path(&state.data_dir, Path::new(source_path.trim()))?;
    let conn = state.db.lock().map_err(|_| "数据库锁异常".to_string())?;
    if let Ok(Some(old)) = get_setting(&conn, "admin_avatar_path") {
        remove_stored_file(&state.data_dir, &old);
    }
    set_setting(&conn, "admin_avatar_path", &new_rel)?;
    Ok(new_rel)
}

#[tauri::command]
pub fn remove_admin_avatar(state: State<'_, AppState>) -> Result<(), String> {
    check_admin(&state)?;
    let conn = state.db.lock().map_err(|_| "数据库锁异常".to_string())?;
    if let Ok(Some(old)) = get_setting(&conn, "admin_avatar_path") {
        remove_stored_file(&state.data_dir, &old);
    }
    set_setting(&conn, "admin_avatar_path", "")?;
    Ok(())
}

#[tauri::command]
pub fn get_data_dir_info(state: State<'_, AppState>) -> Result<DataDirInfo, String> {
    let db_size = fs::metadata(&state.db_path).map(|m| m.len()).unwrap_or(0);
    let img_size = dir_total_size(&state.data_dir.join("images"));
    let rep_size = dir_total_size(&state.data_dir.join("reports"));
    let (instrument_count, report_count) = if let Ok(conn) = state.db.lock() {
        let ic: usize = conn
            .query_row("SELECT COUNT(*) FROM instruments", [], |r| r.get(0))
            .unwrap_or(0);
        let rc: usize = conn
            .query_row("SELECT COUNT(*) FROM calibration_reports", [], |r| r.get(0))
            .unwrap_or(0);
        (ic, rc)
    } else {
        (0, 0)
    };

    Ok(DataDirInfo {
        data_dir: state.data_dir.to_string_lossy().to_string(),
        db_size_bytes: db_size,
        attachments_size_bytes: img_size + rep_size,
        instrument_count,
        report_count,
        app_version: env!("CARGO_PKG_VERSION").to_string(),
    })
}

#[tauri::command]
pub fn open_data_dir(app: AppHandle, state: State<'_, AppState>) -> Result<(), String> {
    check_admin(&state)?;
    app.opener()
        .open_path(state.data_dir.to_string_lossy().as_ref(), None::<&str>)
        .map_err(|e| format!("打开数据目录失败: {}", e))
}

#[tauri::command]
pub fn create_local_backup(
    state: State<'_, AppState>,
    dest_zip_path: String,
) -> Result<BackupResult, String> {
    check_admin(&state)?;
    let conn = state.db.lock().map_err(|_| "数据库锁异常".to_string())?;
    create_backup(&conn, &state.data_dir, Path::new(dest_zip_path.trim()))
}

#[tauri::command]
pub fn restore_local_backup(
    state: State<'_, AppState>,
    src_zip_path: String,
) -> Result<RestoreResult, String> {
    check_admin(&state)?;
    let mut conn = state.db.lock().map_err(|_| "数据库锁异常".to_string())?;
    restore_backup(
        &mut conn,
        &state.db_path,
        &state.data_dir,
        Path::new(src_zip_path.trim()),
    )
}

fn resolve_default_downloads_dir(app: &AppHandle) -> Result<PathBuf, String> {
    if let Ok(dir) = app.path().download_dir() {
        return Ok(dir);
    }
    if let Ok(home) = app.path().home_dir() {
        return Ok(home.join("Downloads"));
    }
    Err("无法获取系统默认下载目录".to_string())
}

#[tauri::command]
pub fn get_default_downloads_dir(app: AppHandle) -> Result<String, String> {
    let dir = resolve_default_downloads_dir(&app)?;
    Ok(dir.to_string_lossy().to_string())
}

#[tauri::command]
pub fn open_folder_path(app: AppHandle, folder_path: String) -> Result<(), String> {
    let trimmed = folder_path.trim();
    if trimmed.is_empty() {
        return Err("目录路径为空".to_string());
    }
    let path = Path::new(trimmed);
    let target = if path.is_file() {
        path.parent().unwrap_or(path)
    } else {
        path
    };
    app.opener()
        .open_path(target.to_string_lossy().as_ref(), None::<&str>)
        .map_err(|e| format!("打开目录失败: {}", e))
}

#[tauri::command]
pub fn reset_app_with_backup(
    app: AppHandle,
    state: State<'_, AppState>,
    admin_password: String,
    backup_dir: Option<String>,
) -> Result<ResetAppResult, String> {
    check_admin(&state)?;

    let mut conn = state.db.lock().map_err(|_| "数据库锁异常".to_string())?;
    let stored_hash = get_setting(&conn, "admin_password_hash")?
        .ok_or_else(|| "管理员密码未初始化".to_string())?;
    if !verify_password(&admin_password, &stored_hash) {
        return Err("管理员密码错误，已取消初始化".to_string());
    }

    let instrument_count: usize = conn
        .query_row("SELECT COUNT(*) FROM instruments", [], |r| r.get(0))
        .unwrap_or(0);
    let report_count: usize = conn
        .query_row("SELECT COUNT(*) FROM calibration_reports", [], |r| r.get(0))
        .unwrap_or(0);

    let target_backup_dir = if instrument_count > 0 || report_count > 0 {
        let dir = match backup_dir {
            Some(ref raw) if !raw.trim().is_empty() => PathBuf::from(raw.trim()),
            _ => resolve_default_downloads_dir(&app)?,
        };
        Some(dir)
    } else {
        None
    };

    let backup = reset_app_data_with_backup(
        &mut conn,
        &state.db_path,
        &state.data_dir,
        target_backup_dir.as_deref(),
    )?;

    let mut session = state.session.lock().map_err(|_| "状态锁异常".to_string())?;
    session.is_admin = false;
    session.is_locked = false;
    session.admin_expires_at = None;

    let auth = build_auth_status(&conn, &session)?;
    emit_auth_status(&app, &auth);

    Ok(ResetAppResult { backup, auth })
}

// ---------------- Updates ----------------

fn resolve_effective_repo(override_val: Option<String>, saved_val: &str) -> String {
    match override_val {
        Some(v) => {
            let trimmed = v.trim();
            if trimmed.is_empty() {
                DEFAULT_GITHUB_REPO.to_string()
            } else {
                trimmed.to_string()
            }
        }
        None => {
            let saved = saved_val.trim();
            if saved.is_empty() {
                DEFAULT_GITHUB_REPO.to_string()
            } else {
                saved.to_string()
            }
        }
    }
}

#[tauri::command]
pub async fn check_for_updates(
    app: AppHandle,
    state: State<'_, AppState>,
    github_repo_override: Option<String>,
    proxy_override: Option<String>,
) -> Result<UpdateCheckResult, String> {
    let (repo, proxy) = {
        let conn = state.db.lock().map_err(|_| "数据库锁异常".to_string())?;
        let settings = load_app_settings(&conn)?;
        (
            resolve_effective_repo(github_repo_override, &settings.github_repo),
            proxy_override.unwrap_or(settings.update_proxy_url),
        )
    };
    let (result, pending) = check_github_release(&app, &repo, &proxy).await?;
    if let Ok(mut guard) = state.pending_update.lock() {
        *guard = pending;
    }
    Ok(result)
}

#[tauri::command]
pub async fn download_and_launch_update(
    app: AppHandle,
    state: State<'_, AppState>,
    github_repo_override: Option<String>,
    proxy_override: Option<String>,
) -> Result<String, String> {
    let (repo, proxy) = {
        let conn = state.db.lock().map_err(|_| "数据库锁异常".to_string())?;
        let settings = load_app_settings(&conn)?;
        (
            resolve_effective_repo(github_repo_override, &settings.github_repo),
            proxy_override.unwrap_or(settings.update_proxy_url),
        )
    };
    let pending = state
        .pending_update
        .lock()
        .ok()
        .and_then(|guard| guard.clone());

    state.allow_exit.store(true, Ordering::SeqCst);
    let res = download_and_install_update(&app, pending, &repo, &proxy).await;
    if res.is_err() {
        state.allow_exit.store(false, Ordering::SeqCst);
    }
    res
}
