mod app_icon;
mod auth;
mod backup;
mod commands;
mod db;
mod models;
mod s3_client;
mod storage;
mod sync_crypto;
mod sync_engine;
mod updater;
mod workbench_store;

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;

use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::TrayIconBuilder;
#[cfg(not(target_os = "macos"))]
use tauri::tray::{MouseButton, MouseButtonState, TrayIconEvent};
use tauri::{AppHandle, Manager};

use crate::app_icon::{apply_app_icon_by_id, DEFAULT_APP_ICON_ID};
use crate::auth::SessionState;
use crate::commands::{
    hide_main_window_and_maybe_lock, lock_app_from_tray, show_main_window, AppState,
};
use crate::db::{
    get_setting, init_db, is_account_initialized, is_app_lock_configured, load_custom_app_icons,
    resolve_startup_admin_session, sanitize_close_behavior, set_setting, DEFAULT_CLOSE_BEHAVIOR,
};
use crate::storage::ensure_storage_dirs;

fn build_tray_menu(app: &AppHandle, is_en: bool) -> Result<Menu<tauri::Wry>, tauri::Error> {
    let show_label = if is_en { "Show Window" } else { "显示主窗口" };
    let lock_label = if is_en { "Lock App" } else { "锁定应用" };
    let quit_label = if is_en { "Quit" } else { "退出程序" };
    let show_item = MenuItem::with_id(app, "tray_show", show_label, true, None::<&str>)?;
    let lock_item = MenuItem::with_id(app, "tray_lock", lock_label, true, None::<&str>)?;
    let sep = PredefinedMenuItem::separator(app)?;
    let quit_item = MenuItem::with_id(app, "tray_quit", quit_label, true, None::<&str>)?;
    Menu::with_items(app, &[&show_item, &lock_item, &sep, &quit_item])
}

pub fn apply_tray_visibility(app: &AppHandle, visible: bool) {
    if let Some(tray) = app.tray_by_id("main-tray") {
        let _ = tray.set_visible(visible);
    }
}

pub fn refresh_tray_language(app: &AppHandle, lang: &str) {
    let is_en = lang.trim().eq_ignore_ascii_case("en");
    if let Some(tray) = app.tray_by_id("main-tray") {
        if let Ok(menu) = build_tray_menu(app, is_en) {
            let _ = tray.set_menu(Some(menu));
        }
    }
}

fn setup_tray(
    app: &tauri::App,
    visible: bool,
    is_en: bool,
) -> Result<(), Box<dyn std::error::Error>> {
    let menu = build_tray_menu(app.handle(), is_en)?;

    let mut builder = TrayIconBuilder::with_id("main-tray")
        .menu(&menu)
        .tooltip("InstrumentLedger");

    #[cfg(target_os = "macos")]
    {
        let tray_icon =
            tauri::image::Image::from_bytes(include_bytes!("../icons/tray-template.png"))?;
        builder = builder
            .icon(tray_icon)
            .icon_as_template(true)
            .show_menu_on_left_click(true);
    }

    #[cfg(not(target_os = "macos"))]
    {
        if let Some(icon) = app.default_window_icon().cloned() {
            builder = builder.icon(icon);
        }
        builder = builder.show_menu_on_left_click(false);
    }

    builder
        .on_menu_event(|app, event| match event.id().as_ref() {
            "tray_show" => {
                show_main_window(app);
            }
            "tray_lock" => {
                lock_app_from_tray(app);
            }
            "tray_quit" => {
                let state = app.state::<AppState>();
                state.allow_exit.store(true, Ordering::SeqCst);
                app.exit(0);
            }
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            #[cfg(not(target_os = "macos"))]
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                show_main_window(tray.app_handle());
            }
            #[cfg(target_os = "macos")]
            let _ = (tray, event);
        })
        .build(app)?;

    if !visible {
        apply_tray_visibility(app.handle(), false);
    }

    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .setup(|app| {
            let app_data_dir = app
                .path()
                .app_data_dir()
                .map_err(|e| format!("获取应用数据目录失败: {}", e))?;
            let data_dir = app_data_dir.join("data");
            ensure_storage_dirs(&data_dir)?;
            let db_path = data_dir.join("ledger.db");
            let conn = init_db(&db_path)?;

            // Restore persisted admin session (with expiry validation) and app-lock state independently
            let initialized = is_account_initialized(&conn)?;
            let (restore_admin, admin_expires_at) = resolve_startup_admin_session(&conn)?;

            let (app_lock_ready, _) = is_app_lock_configured(&conn)?;
            let was_locked = get_setting(&conn, "app_lock_active")?.as_deref() == Some("1");
            let lock_on_startup = get_setting(&conn, "lock_on_startup")?.as_deref() == Some("1");
            let start_locked = initialized && app_lock_ready && (was_locked || lock_on_startup);
            if start_locked && !was_locked {
                let _ = set_setting(&conn, "app_lock_active", "1");
            } else if !app_lock_ready && was_locked {
                let _ = set_setting(&conn, "app_lock_active", "0");
            }

            let show_tray_icon = get_setting(&conn, "show_tray_icon")?.as_deref() != Some("0");
            let ui_language = get_setting(&conn, "ui_language")?.unwrap_or_default();
            let is_en_tray = ui_language.trim().eq_ignore_ascii_case("en");
            let startup_icon_id = get_setting(&conn, "app_icon_id")?
                .unwrap_or_else(|| DEFAULT_APP_ICON_ID.to_string());
            let startup_custom_icons = load_custom_app_icons(&conn);
            let data_dir_for_icon = data_dir.clone();

            app.manage(AppState {
                db: Mutex::new(conn),
                session: Mutex::new(SessionState {
                    is_admin: restore_admin,
                    is_locked: start_locked,
                    admin_expires_at,
                }),
                pending_update: Mutex::new(None),
                allow_exit: AtomicBool::new(false),
                sync_in_flight: AtomicBool::new(false),
                data_dir,
                db_path,
            });

            setup_tray(app, show_tray_icon, is_en_tray)?;
            if startup_icon_id != DEFAULT_APP_ICON_ID {
                let _ = apply_app_icon_by_id(
                    app.handle(),
                    &data_dir_for_icon,
                    &startup_icon_id,
                    &startup_custom_icons,
                );
            }
            Ok(())
        })
        .on_window_event(|window, event| {
            if window.label() != "main" {
                return;
            }
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                let state = window.state::<AppState>();
                if state.allow_exit.load(Ordering::SeqCst) {
                    return;
                }
                let (initialized, close_behavior) = match state.db.lock() {
                    Ok(conn) => {
                        let init = is_account_initialized(&conn).unwrap_or(false);
                        let behavior = get_setting(&conn, "close_behavior")
                            .ok()
                            .flatten()
                            .map(|v| sanitize_close_behavior(&v))
                            .unwrap_or_else(|| DEFAULT_CLOSE_BEHAVIOR.to_string());
                        (init, behavior)
                    }
                    Err(_) => (false, "exit".to_string()),
                };

                if !initialized || close_behavior == "exit" {
                    return;
                }

                api.prevent_close();
                hide_main_window_and_maybe_lock(window.app_handle());
            }
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_auth_status,
            commands::setup_initial_admin,
            commands::admin_login,
            commands::admin_logout,
            commands::configure_app_lock,
            commands::disable_app_lock,
            commands::lock_app,
            commands::unlock_app,
            commands::unlock_app_with_admin,
            commands::perform_close_action,
            commands::set_close_behavior,
            commands::update_appearance_preferences,
            commands::add_custom_app_icon,
            commands::delete_custom_app_icon,
            commands::change_admin_password,
            commands::list_instruments,
            commands::create_instrument,
            commands::update_instrument,
            commands::delete_instrument,
            commands::batch_delete_instruments,
            commands::batch_update_instruments,
            commands::batch_import_instruments,
            commands::list_reports,
            commands::add_report,
            commands::delete_report,
            commands::open_report_external,
            commands::export_report_to_path,
            commands::read_stored_file_base64,
            commands::read_external_file_base64,
            commands::write_external_file_base64,
            commands::read_workbench_file_raw,
            commands::write_workbench_file_raw,
            commands::workbench_pdf_read_workspace,
            commands::workbench_pdf_write_workspace,
            commands::workbench_pdf_read_draft_meta,
            commands::workbench_pdf_read_source_raw,
            commands::workbench_pdf_list_drafts,
            commands::workbench_pdf_save_source_raw,
            commands::workbench_pdf_save_markers,
            commands::workbench_pdf_delete_draft,
            commands::workbench_pdf_clear_all,
            commands::workbench_pdf_cache_stats,
            commands::workbench_pdf_prune_cache,
            commands::get_settings,
            commands::update_settings,
            commands::upload_company_logo,
            commands::remove_company_logo,
            commands::upload_admin_avatar,
            commands::remove_admin_avatar,
            commands::get_data_dir_info,
            commands::open_data_dir,
            commands::create_local_backup,
            commands::restore_local_backup,
            commands::get_default_downloads_dir,
            commands::open_folder_path,
            commands::reset_app_with_backup,
            commands::check_for_updates,
            commands::download_and_launch_update,
            commands::fetch_release_history,
            commands::get_sync_config,
            commands::save_sync_config,
            commands::test_sync_connection,
            commands::check_sync_status,
            commands::sync_push,
            commands::sync_pull,
            commands::sync_now,
        ])
        .build(tauri::generate_context!())
        .expect("error while building InstrumentLedger application");

    app.run(|app_handle, event| {
        #[cfg(target_os = "macos")]
        if let tauri::RunEvent::Reopen { .. } = event {
            show_main_window(app_handle);
        }
        #[cfg(not(target_os = "macos"))]
        let _ = (app_handle, event);
    });
}
