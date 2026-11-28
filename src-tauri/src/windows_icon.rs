use std::cell::Cell;
use std::ffi::OsString;
use std::fs;
use std::os::windows::ffi::{OsStrExt, OsStringExt};
use std::path::{Path, PathBuf};

use image::codecs::ico::{IcoEncoder, IcoFrame};
use image::imageops::{resize, FilterType};
use image::{ExtendedColorType, ImageFormat};
use tauri::{AppHandle, Manager};
use windows::core::{Interface, PCWSTR};
use windows::Win32::Foundation::{HWND, LPARAM, WPARAM};
use windows::Win32::System::Com::{
    CoCreateInstance, CoInitializeEx, CoTaskMemFree, CoUninitialize, IPersistFile,
    CLSCTX_INPROC_SERVER, COINIT_APARTMENTTHREADED, STGM_READ,
};
use windows::Win32::UI::Shell::{
    FOLDERID_Desktop, FOLDERID_Programs, FOLDERID_PublicDesktop, FOLDERID_RoamingAppData,
    IShellLinkW, SHChangeNotify, SHGetKnownFolderPath, SetCurrentProcessExplicitAppUserModelID,
    ShellLink, KF_FLAG_DEFAULT, SHCNE_UPDATEITEM, SHCNF_PATHW,
};
use windows::Win32::UI::WindowsAndMessaging::{
    DestroyIcon, LoadImageW, SendMessageW, HICON, ICON_BIG, IMAGE_ICON, LR_DEFAULTSIZE,
    LR_LOADFROMFILE, WM_SETICON,
};

thread_local! {
    static TASKBAR_ICON: Cell<HICON> = const { Cell::new(HICON(std::ptr::null_mut())) };
}

pub fn set_app_id(identifier: &str) -> windows::core::Result<()> {
    // Match the AppUserModelID written by the NSIS installer to its shortcuts.
    let id: Vec<u16> = identifier.encode_utf16().chain([0]).collect();
    unsafe { SetCurrentProcessExplicitAppUserModelID(PCWSTR(id.as_ptr())) }
}

pub fn apply(app: &AppHandle, png_bytes: &[u8]) -> Result<(), String> {
    let icon_path = save_icon(
        &app.path()
            .app_local_data_dir()
            .map_err(|err| err.to_string())?,
        png_bytes,
    )
    .map_err(|err| format!("生成 Windows 图标失败: {err}"))?;
    let executable = std::env::current_exe().map_err(|err| err.to_string())?;
    let app_handle = app.clone();
    app.run_on_main_thread(move || {
        if let Some(window) = app_handle.get_webview_window("main") {
            if let Err(err) = window
                .hwnd()
                .map_err(|err| err.to_string())
                .and_then(|hwnd| set_taskbar_icon(hwnd, &icon_path).map_err(|err| err.to_string()))
            {
                eprintln!("更新 Windows 任务栏图标失败: {err}");
            }
        }
        if let Err(err) = update_shortcuts(&executable, &icon_path) {
            eprintln!("更新 Windows 快捷方式图标失败: {err}");
        }
    })
    .map_err(|err| err.to_string())
}

fn save_icon(app_data: &Path, png_bytes: &[u8]) -> Result<PathBuf, Box<dyn std::error::Error>> {
    let hash = hex::encode(ring::digest::digest(&ring::digest::SHA256, png_bytes));
    let directory = app_data.join("shell-icons");
    // A different path for each image lets Explorer discard the previous cached icon.
    let path = directory.join(format!("{hash}.ico"));
    if path.is_file() {
        return Ok(path);
    }

    let source = image::load_from_memory_with_format(png_bytes, ImageFormat::Png)?.into_rgba8();
    let frames = [16, 24, 32, 48, 64, 256]
        .into_iter()
        .map(|size| {
            let image = resize(&source, size, size, FilterType::Lanczos3);
            IcoFrame::as_png(image.as_raw(), size, size, ExtendedColorType::Rgba8)
        })
        .collect::<image::ImageResult<Vec<_>>>()?;
    let mut ico = Vec::new();
    IcoEncoder::new(&mut ico).encode_images(&frames)?;
    fs::create_dir_all(directory)?;
    let tmp = directory.join(format!("{}.tmp", uuid::Uuid::new_v4()));
    if let Err(err) = fs::write(&tmp, ico).and_then(|_| fs::rename(&tmp, &path)) {
        let _ = fs::remove_file(tmp);
        return Err(err.into());
    }
    Ok(path)
}

fn set_taskbar_icon(hwnd: HWND, icon_path: &Path) -> windows::core::Result<()> {
    let file = wide_path(icon_path);
    // Tauri's set_icon updates ICON_SMALL through Tao. The taskbar uses ICON_BIG.
    unsafe {
        let icon = HICON(
            LoadImageW(
                None,
                PCWSTR(file.as_ptr()),
                IMAGE_ICON,
                0,
                0,
                LR_LOADFROMFILE | LR_DEFAULTSIZE,
            )?
            .0,
        );
        SendMessageW(
            hwnd,
            WM_SETICON,
            Some(WPARAM(ICON_BIG as usize)),
            Some(LPARAM(icon.0 as isize)),
        );
        let previous = TASKBAR_ICON.replace(icon);
        if !previous.is_invalid() {
            let _ = DestroyIcon(previous);
        }
    }
    Ok(())
}

struct ComApartment;

impl ComApartment {
    fn init() -> windows::core::Result<Self> {
        unsafe { CoInitializeEx(None, COINIT_APARTMENTTHREADED).ok()? };
        Ok(Self)
    }
}

impl Drop for ComApartment {
    fn drop(&mut self) {
        unsafe { CoUninitialize() };
    }
}

fn update_shortcuts(executable: &Path, icon_path: &Path) -> windows::core::Result<()> {
    let _com = ComApartment::init()?;
    let Ok(executable) = executable.canonicalize() else {
        return Ok(());
    };
    let icon = wide_path(icon_path);
    let folders = [
        (known_folder(&FOLDERID_Desktop), 1),
        (known_folder(&FOLDERID_PublicDesktop), 1),
        (known_folder(&FOLDERID_Programs), 3),
        (
            known_folder(&FOLDERID_RoamingAppData).map(|path| {
                path.join(r"Microsoft\Internet Explorer\Quick Launch\User Pinned\TaskBar")
            }),
            1,
        ),
    ];

    for (folder, depth) in folders {
        let Some(folder) = folder else { continue };
        for entry in walkdir::WalkDir::new(folder)
            .max_depth(depth)
            .into_iter()
            .filter_map(Result::ok)
        {
            let path = entry.path();
            if entry.file_type().is_file()
                && path
                    .extension()
                    .is_some_and(|ext| ext.eq_ignore_ascii_case("lnk"))
            {
                if let Err(err) = update_shortcut(path, &executable, &icon) {
                    eprintln!("更新快捷方式 {} 失败: {err}", path.display());
                }
            }
        }
    }
    Ok(())
}

fn update_shortcut(path: &Path, executable: &Path, icon: &[u16]) -> windows::core::Result<()> {
    let link_file = wide_path(path);
    let link_file = PCWSTR(link_file.as_ptr());
    // Use Shell Link to preserve the existing shortcut's target, arguments and app identity.
    unsafe {
        let link: IShellLinkW = CoCreateInstance(&ShellLink, None, CLSCTX_INPROC_SERVER)?;
        let persist: IPersistFile = link.cast()?;
        persist.Load(link_file, STGM_READ)?;
        let mut target = vec![0; 32768];
        link.GetPath(&mut target, std::ptr::null_mut(), 0)?;
        let target = PathBuf::from(os_string(&target));
        if target
            .file_name()
            .zip(executable.file_name())
            .is_none_or(|(target, exe)| !target.eq_ignore_ascii_case(exe))
            || target.canonicalize().as_deref().ok() != Some(executable)
        {
            return Ok(());
        }

        let mut existing = vec![0; 32768];
        let mut index = 0;
        if link.GetIconLocation(&mut existing, &mut index).is_ok()
            && index == 0
            && existing.starts_with(icon)
        {
            return Ok(());
        }

        link.SetIconLocation(PCWSTR(icon.as_ptr()), 0)?;
        persist.Save(link_file, true)?;
        SHChangeNotify(
            SHCNE_UPDATEITEM,
            SHCNF_PATHW,
            Some(link_file.as_ptr().cast()),
            None,
        );
    }
    Ok(())
}

fn known_folder(id: &windows::core::GUID) -> Option<PathBuf> {
    // SHGetKnownFolderPath returns a shell-allocated, NUL-terminated UTF-16 path.
    unsafe {
        let value = SHGetKnownFolderPath(id, KF_FLAG_DEFAULT, None).ok()?;
        let path = PathBuf::from(OsString::from_wide(value.as_wide()));
        CoTaskMemFree(Some(value.as_ptr().cast()));
        Some(path)
    }
}

fn wide_path(path: &Path) -> Vec<u16> {
    path.as_os_str().encode_wide().chain([0]).collect()
}

fn os_string(buffer: &[u16]) -> OsString {
    let end = buffer
        .iter()
        .position(|value| *value == 0)
        .unwrap_or(buffer.len());
    OsString::from_wide(&buffer[..end])
}

#[cfg(test)]
mod tests {
    use super::*;
    use windows::core::w;

    #[test]
    fn updates_existing_shortcut_icon_and_preserves_launch_arguments() {
        let app_data =
            std::env::temp_dir().join(format!("instrument-icon-{}", uuid::Uuid::new_v4()));
        let ico = save_icon(&app_data, include_bytes!("../icons/icon-obsidian.png")).unwrap();
        let icon = wide_path(&ico);
        let _com = ComApartment::init().unwrap();
        let executable = std::env::current_exe().unwrap().canonicalize().unwrap();
        let exe_path = wide_path(&executable);
        let link = app_data.join("Renamed Shortcut.lnk");
        let link_path = wide_path(&link);
        let link_path = PCWSTR(link_path.as_ptr());
        unsafe {
            let shortcut: IShellLinkW =
                CoCreateInstance(&ShellLink, None, CLSCTX_INPROC_SERVER).unwrap();
            shortcut.SetPath(PCWSTR(exe_path.as_ptr())).unwrap();
            shortcut.SetArguments(w!("--test-argument")).unwrap();
            let persist: IPersistFile = shortcut.cast().unwrap();
            persist.Save(link_path, true).unwrap();

            update_shortcut(&link, &executable, &icon).unwrap();
            persist.Load(link_path, STGM_READ).unwrap();
            let mut selected = vec![0; 32768];
            let mut index = -1;
            shortcut.GetIconLocation(&mut selected, &mut index).unwrap();
            assert_eq!(PathBuf::from(os_string(&selected)), ico);
            assert_eq!(index, 0);

            let mut arguments = [0; 64];
            shortcut.GetArguments(&mut arguments).unwrap();
            assert_eq!(os_string(&arguments), "--test-argument");
        }
        fs::remove_dir_all(app_data).unwrap();
    }
}
