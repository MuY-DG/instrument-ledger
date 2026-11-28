use std::fs;
use std::path::Path;

use tauri::AppHandle;
#[cfg(not(target_os = "macos"))]
use tauri::Manager;

use crate::models::CustomAppIcon;
use crate::storage::resolve_stored_path;

pub const DEFAULT_APP_ICON_ID: &str = "default";
pub const OBSIDIAN_APP_ICON_ID: &str = "obsidian";

const DEFAULT_ICON_PNG: &[u8] = include_bytes!("../icons/icon.png");
const OBSIDIAN_ICON_PNG: &[u8] = include_bytes!("../icons/icon-obsidian.png");

pub fn resolve_icon_png_bytes(
    data_dir: &Path,
    icon_id: &str,
    custom_icons: &[CustomAppIcon],
) -> Vec<u8> {
    match icon_id.trim() {
        "" | DEFAULT_APP_ICON_ID => DEFAULT_ICON_PNG.to_vec(),
        OBSIDIAN_APP_ICON_ID => OBSIDIAN_ICON_PNG.to_vec(),
        other => {
            if let Some(found) = custom_icons.iter().find(|c| c.id == other) {
                if let Ok(path) = resolve_stored_path(data_dir, &found.stored_path) {
                    if let Ok(bytes) = fs::read(path) {
                        if !bytes.is_empty() {
                            return bytes;
                        }
                    }
                }
            }
            DEFAULT_ICON_PNG.to_vec()
        }
    }
}

pub fn apply_app_icon_by_id(
    app: &AppHandle,
    data_dir: &Path,
    icon_id: &str,
    custom_icons: &[CustomAppIcon],
) -> Result<(), String> {
    let bytes = resolve_icon_png_bytes(data_dir, icon_id, custom_icons);
    apply_app_icon_png(app, bytes)
}

#[cfg(target_os = "macos")]
pub fn apply_app_icon_png(app: &AppHandle, png_bytes: Vec<u8>) -> Result<(), String> {
    use objc2::{AnyThread, MainThreadMarker};
    use objc2_app_kit::{NSApplication, NSImage};
    use objc2_foundation::NSData;

    let app_handle = app.clone();
    app_handle
        .run_on_main_thread(move || {
            let Some(mtm) = MainThreadMarker::new() else {
                return;
            };
            let ns_data = NSData::with_bytes(&png_bytes);
            if let Some(ns_image) = NSImage::initWithData(NSImage::alloc(), &ns_data) {
                let ns_app = NSApplication::sharedApplication(mtm);
                unsafe {
                    ns_app.setApplicationIconImage(Some(&ns_image));
                }
            }
        })
        .map_err(|e| format!("更新 macOS 应用图标失败: {}", e))?;

    Ok(())
}

#[cfg(not(target_os = "macos"))]
pub fn apply_app_icon_png(app: &AppHandle, png_bytes: Vec<u8>) -> Result<(), String> {
    let img = tauri::image::Image::from_bytes(&png_bytes)
        .map_err(|e| format!("解析应用图标 PNG 失败: {}", e))?;

    if let Some(win) = app.get_webview_window("main") {
        let _ = win.set_icon(img.clone());
    }
    if let Some(tray) = app.tray_by_id("main-tray") {
        let _ = tray.set_icon(Some(img));
    }
    Ok(())
}
