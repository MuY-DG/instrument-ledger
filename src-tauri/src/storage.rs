use std::fs;
use std::path::{Component, Path, PathBuf};

use base64::Engine;
use uuid::Uuid;

pub fn ensure_storage_dirs(data_dir: &Path) -> Result<(), String> {
    fs::create_dir_all(data_dir.join("images"))
        .map_err(|e| format!("创建图片目录失败: {}", e))?;
    fs::create_dir_all(data_dir.join("reports"))
        .map_err(|e| format!("创建报告目录失败: {}", e))?;
    Ok(())
}

/// Safely resolve a relative stored path (e.g. "images/abc.jpg" or "reports/1/xyz.pdf") inside data_dir
pub fn resolve_stored_path(data_dir: &Path, rel_path: &str) -> Result<PathBuf, String> {
    let trimmed = rel_path.trim();
    if trimmed.is_empty() {
        return Err("文件路径为空".to_string());
    }
    let rel = Path::new(trimmed);
    for comp in rel.components() {
        match comp {
            Component::Normal(_) => {}
            _ => return Err("非法文件路径".to_string()),
        }
    }
    let first = rel
        .components()
        .next()
        .and_then(|c| c.as_os_str().to_str())
        .unwrap_or("");
    if first != "images" && first != "reports" {
        return Err("仅允许访问受管附件目录".to_string());
    }
    Ok(data_dir.join(rel))
}

fn clean_ext(filename: &str, fallback: &str) -> String {
    let ext = Path::new(filename)
        .extension()
        .and_then(|s| s.to_str())
        .unwrap_or(fallback)
        .to_lowercase();
    let cleaned: String = ext.chars().filter(|c| c.is_ascii_alphanumeric()).collect();
    if cleaned.is_empty() {
        fallback.to_string()
    } else {
        cleaned
    }
}

pub fn save_image_from_path(data_dir: &Path, src_path: &Path) -> Result<String, String> {
    ensure_storage_dirs(data_dir)?;
    let filename = src_path
        .file_name()
        .and_then(|s| s.to_str())
        .unwrap_or("image.png");
    let ext = clean_ext(filename, "png");
    let rel = format!("images/{}.{}", Uuid::new_v4(), ext);
    let dest = data_dir.join(&rel);
    fs::copy(src_path, &dest).map_err(|e| format!("保存位置图片失败: {}", e))?;
    Ok(rel)
}

pub fn save_image_from_base64(
    data_dir: &Path,
    base64_str: &str,
    filename_hint: Option<&str>,
) -> Result<String, String> {
    ensure_storage_dirs(data_dir)?;
    let raw_b64 = match base64_str.find(',') {
        Some(idx) => &base64_str[idx + 1..],
        None => base64_str,
    };
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(raw_b64.trim())
        .map_err(|e| format!("解码图片数据失败: {}", e))?;
    let ext = clean_ext(filename_hint.unwrap_or("photo.jpg"), "jpg");
    let rel = format!("images/{}.{}", Uuid::new_v4(), ext);
    let dest = data_dir.join(&rel);
    fs::write(&dest, bytes).map_err(|e| format!("写入图片文件失败: {}", e))?;
    Ok(rel)
}

pub fn save_report_from_path(
    data_dir: &Path,
    instrument_id: i64,
    src_path: &Path,
) -> Result<(String, String, String, i64), String> {
    ensure_storage_dirs(data_dir)?;
    let orig_name = src_path
        .file_name()
        .and_then(|s| s.to_str())
        .unwrap_or("report.pdf")
        .to_string();
    let ext = clean_ext(&orig_name, "pdf");
    let inst_dir = data_dir.join("reports").join(instrument_id.to_string());
    fs::create_dir_all(&inst_dir).map_err(|e| format!("创建仪器报告目录失败: {}", e))?;

    let rel = format!("reports/{}/{}.{}", instrument_id, Uuid::new_v4(), ext);
    let dest = data_dir.join(&rel);
    let copied = fs::copy(src_path, &dest).map_err(|e| format!("保存校验报告失败: {}", e))?;
    Ok((orig_name, rel, ext, copied as i64))
}

pub fn save_report_from_base64(
    data_dir: &Path,
    instrument_id: i64,
    base64_str: &str,
    orig_name: &str,
) -> Result<(String, String, String, i64), String> {
    ensure_storage_dirs(data_dir)?;
    let raw_b64 = match base64_str.find(',') {
        Some(idx) => &base64_str[idx + 1..],
        None => base64_str,
    };
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(raw_b64.trim())
        .map_err(|e| format!("解码报告文件失败: {}", e))?;
    let safe_name = if orig_name.trim().is_empty() {
        "report.pdf".to_string()
    } else {
        orig_name.trim().to_string()
    };
    let ext = clean_ext(&safe_name, "pdf");
    let inst_dir = data_dir.join("reports").join(instrument_id.to_string());
    fs::create_dir_all(&inst_dir).map_err(|e| format!("创建仪器报告目录失败: {}", e))?;

    let rel = format!("reports/{}/{}.{}", instrument_id, Uuid::new_v4(), ext);
    let dest = data_dir.join(&rel);
    let size = bytes.len() as i64;
    fs::write(&dest, bytes).map_err(|e| format!("写入校验报告失败: {}", e))?;
    Ok((safe_name, rel, ext, size))
}

pub fn remove_stored_file(data_dir: &Path, rel_path: &str) {
    if rel_path.trim().is_empty() {
        return;
    }
    if let Ok(full) = resolve_stored_path(data_dir, rel_path) {
        let _ = fs::remove_file(full);
    }
}

pub fn mime_from_ext(ext: &str) -> &'static str {
    match ext.to_lowercase().as_str() {
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "webp" => "image/webp",
        "gif" => "image/gif",
        "bmp" => "image/bmp",
        "svg" => "image/svg+xml",
        "pdf" => "application/pdf",
        _ => "application/octet-stream",
    }
}

pub fn dir_total_size(path: &Path) -> u64 {
    if !path.exists() {
        return 0;
    }
    walkdir::WalkDir::new(path)
        .into_iter()
        .filter_map(|e| e.ok())
        .filter(|e| e.file_type().is_file())
        .filter_map(|e| e.metadata().ok())
        .map(|m| m.len())
        .sum()
}
