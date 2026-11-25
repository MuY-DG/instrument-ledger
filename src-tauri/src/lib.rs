mod auth;
mod backup;
mod commands;
mod db;
mod models;
mod storage;
mod updater;

use std::sync::Mutex;
use tauri::Manager;

use crate::auth::SessionState;
use crate::commands::AppState;
use crate::db::init_db;
use crate::storage::ensure_storage_dirs;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_process::init())
        .setup(|app| {
            let app_data_dir = app
                .path()
                .app_data_dir()
                .map_err(|e| format!("获取应用数据目录失败: {}", e))?;
            let data_dir = app_data_dir.join("data");
            ensure_storage_dirs(&data_dir)?;
            let db_path = data_dir.join("ledger.db");
            let conn = init_db(&db_path)?;

            app.manage(AppState {
                db: Mutex::new(conn),
                session: Mutex::new(SessionState::default()),
                data_dir,
                db_path,
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_auth_status,
            commands::setup_initial_admin,
            commands::admin_login,
            commands::admin_logout,
            commands::lock_app,
            commands::unlock_app,
            commands::change_admin_password,
            commands::list_instruments,
            commands::create_instrument,
            commands::update_instrument,
            commands::delete_instrument,
            commands::batch_import_instruments,
            commands::list_reports,
            commands::add_report,
            commands::delete_report,
            commands::open_report_external,
            commands::export_report_to_path,
            commands::read_stored_file_base64,
            commands::read_external_file_base64,
            commands::write_external_file_base64,
            commands::get_settings,
            commands::update_settings,
            commands::upload_company_logo,
            commands::remove_company_logo,
            commands::get_data_dir_info,
            commands::open_data_dir,
            commands::create_local_backup,
            commands::restore_local_backup,
            commands::check_for_updates,
            commands::download_and_launch_update,
        ])
        .run(tauri::generate_context!())
        .expect("error while running InstrumentLedger application");
}
