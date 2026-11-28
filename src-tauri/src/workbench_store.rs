use std::collections::HashSet;
use std::fs;
use std::path::{Path, PathBuf};

use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use uuid::Uuid;
use walkdir::WalkDir;

use crate::db::{get_setting, set_setting};
use crate::storage::dir_total_size;

pub const DEFAULT_WORKBENCH_CACHE_LIMIT_MB: i64 = 1024; // 1 GB
pub const MIN_WORKBENCH_CACHE_LIMIT_MB: i64 = 128;
pub const MAX_WORKBENCH_CACHE_LIMIT_MB: i64 = 10240; // 10 GB

pub fn sanitize_workbench_cache_limit_mb(mb: i64) -> i64 {
    mb.clamp(MIN_WORKBENCH_CACHE_LIMIT_MB, MAX_WORKBENCH_CACHE_LIMIT_MB)
}

pub fn workbench_root_dir(data_dir: &Path) -> PathBuf {
    data_dir.join("workbench")
}

pub fn pdf_sources_dir(data_dir: &Path) -> PathBuf {
    workbench_root_dir(data_dir)
        .join("pdf-balloon")
        .join("sources")
}

pub fn ensure_workbench_dirs(data_dir: &Path) -> Result<(), String> {
    fs::create_dir_all(pdf_sources_dir(data_dir))
        .map_err(|e| format!("创建工具台缓存目录失败: {}", e))?;
    Ok(())
}

fn validate_draft_id(id: &str) -> Result<&str, String> {
    let trimmed = id.trim();
    if trimmed.is_empty() || trimmed.len() > 128 {
        return Err("无效的草稿标识".to_string());
    }
    if !trimmed
        .chars()
        .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
    {
        return Err("草稿标识包含非法字符".to_string());
    }
    Ok(trimmed)
}

fn source_rel_path_for(id: &str) -> String {
    format!("workbench/pdf-balloon/sources/{}.pdf", id)
}

fn source_abs_path_for(data_dir: &Path, id: &str) -> PathBuf {
    pdf_sources_dir(data_dir).join(format!("{}.pdf", id))
}

/// Atomic file write (write temp -> rename) to guarantee crash-safe cached PDFs.
fn write_file_atomic(dest: &Path, bytes: &[u8]) -> Result<(), String> {
    if let Some(parent) = dest.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("创建缓存目录失败: {}", e))?;
    }
    let tmp = dest.with_extension(format!("tmp.{}", Uuid::new_v4()));
    fs::write(&tmp, bytes).map_err(|e| format!("写入缓存文件失败: {}", e))?;
    if dest.exists() {
        let _ = fs::remove_file(dest);
    }
    if let Err(e) = fs::rename(&tmp, dest) {
        let _ = fs::remove_file(&tmp);
        return Err(format!("提交缓存文件失败: {}", e));
    }
    Ok(())
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkbenchPdfWorkspaceState {
    pub active_id: Option<String>,
    pub screen: String, // "home" | "document"
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkbenchPdfDraftMeta {
    pub id: String,
    pub name: String,
    pub byte_length: u64,
    pub page_count: i64,
    pub marker_count: i64,
    pub markers_json: String,
    pub view_json: Option<String>,
    pub next_number: i64,
    pub compatibility: bool,
    pub revision: i64,
    pub updated_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkbenchPdfSummary {
    pub id: String,
    pub name: String,
    pub updated_at: i64,
    pub marker_count: i64,
    pub page_count: i64,
    pub byte_length: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkbenchPdfPage {
    pub items: Vec<WorkbenchPdfSummary>,
    pub cursor_updated_at: Option<i64>,
    pub cursor_id: Option<String>,
    pub total: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkbenchCacheStats {
    pub total_bytes: u64,
    pub draft_count: usize,
    pub limit_bytes: u64,
    pub limit_mb: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkbenchCachePruneResult {
    pub evicted_count: usize,
    pub freed_bytes: u64,
    pub total_bytes: u64,
    pub draft_count: usize,
    pub limit_bytes: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkbenchPdfSaveResult {
    pub revision: i64,
    pub evicted_count: usize,
    pub freed_bytes: u64,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SavePdfSourceMeta {
    pub id: String,
    pub name: String,
    pub page_count: i64,
    pub marker_count: i64,
    pub markers_json: String,
    pub view_json: Option<String>,
    pub next_number: i64,
    pub compatibility: bool,
    pub updated_at: i64,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SavePdfMarkersInput {
    pub id: String,
    pub marker_count: i64,
    pub markers_json: String,
    pub view_json: Option<String>,
    pub next_number: i64,
    pub compatibility: bool,
    pub updated_at: i64,
    pub screen: Option<String>,
}

pub fn get_workbench_cache_limit_mb(conn: &Connection) -> i64 {
    get_setting(conn, "workbench_cache_limit_mb")
        .ok()
        .flatten()
        .and_then(|v| v.parse::<i64>().ok())
        .map(sanitize_workbench_cache_limit_mb)
        .unwrap_or(DEFAULT_WORKBENCH_CACHE_LIMIT_MB)
}

pub fn get_backup_include_workbench(conn: &Connection) -> bool {
    get_setting(conn, "backup_include_workbench")
        .ok()
        .flatten()
        .as_deref()
        == Some("1")
}

pub fn read_pdf_workspace_state(conn: &Connection) -> Result<WorkbenchPdfWorkspaceState, String> {
    let raw: Option<String> = conn
        .query_row(
            "SELECT value FROM workbench_pdf_state WHERE key = 'navigation'",
            [],
            |r| r.get(0),
        )
        .optional()
        .map_err(|e| format!("读取工作台导航状态失败: {}", e))?;

    if let Some(json) = raw {
        if let Ok(parsed) = serde_json::from_str::<WorkbenchPdfWorkspaceState>(&json) {
            let screen = if parsed.screen == "document" {
                "document".to_string()
            } else {
                "home".to_string()
            };
            return Ok(WorkbenchPdfWorkspaceState {
                active_id: parsed.active_id,
                screen,
            });
        }
    }

    Ok(WorkbenchPdfWorkspaceState {
        active_id: None,
        screen: "home".to_string(),
    })
}

pub fn write_pdf_workspace_state(
    conn: &Connection,
    state: &WorkbenchPdfWorkspaceState,
) -> Result<(), String> {
    let json = serde_json::to_string(state)
        .map_err(|e| format!("序列化工作台导航状态失败: {}", e))?;
    conn.execute(
        "INSERT INTO workbench_pdf_state (key, value) VALUES ('navigation', ?1)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        params![json],
    )
    .map_err(|e| format!("写入工作台导航状态失败: {}", e))?;
    Ok(())
}

pub fn read_pdf_draft_meta(
    conn: &Connection,
    data_dir: &Path,
    id: &str,
) -> Result<Option<WorkbenchPdfDraftMeta>, String> {
    let id = validate_draft_id(id)?;
    let row = conn
        .query_row(
            "SELECT id, name, byte_length, page_count, marker_count, markers_json, view_json,
                    next_number, compatibility, revision, updated_at
             FROM workbench_pdf_drafts WHERE id = ?1",
            params![id],
            |r| {
                let view_raw: String = r.get(6)?;
                let compat_int: i64 = r.get(8)?;
                Ok(WorkbenchPdfDraftMeta {
                    id: r.get(0)?,
                    name: r.get(1)?,
                    byte_length: r.get::<_, i64>(2)?.max(0) as u64,
                    page_count: r.get(3)?,
                    marker_count: r.get(4)?,
                    markers_json: r.get(5)?,
                    view_json: if view_raw.trim().is_empty() {
                        None
                    } else {
                        Some(view_raw)
                    },
                    next_number: r.get(7)?,
                    compatibility: compat_int != 0,
                    revision: r.get(9)?,
                    updated_at: r.get(10)?,
                })
            },
        )
        .optional()
        .map_err(|e| format!("读取图纸草稿失败: {}", e))?;

    if let Some(ref meta) = row {
        let abs = source_abs_path_for(data_dir, &meta.id);
        if !abs.exists() {
            // Clean broken reference automatically
            let _ = conn.execute("DELETE FROM workbench_pdf_drafts WHERE id = ?1", params![id]);
            return Ok(None);
        }
    }
    Ok(row)
}

pub fn read_pdf_source_bytes(data_dir: &Path, id: &str) -> Result<Vec<u8>, String> {
    let id = validate_draft_id(id)?;
    let abs = source_abs_path_for(data_dir, id);
    fs::read(&abs).map_err(|e| format!("读取本地缓存图纸失败: {}", e))
}

pub fn list_pdf_drafts(
    conn: &Connection,
    cursor_updated_at: Option<i64>,
    cursor_id: Option<&str>,
    limit: usize,
    query: &str,
) -> Result<WorkbenchPdfPage, String> {
    let limit = limit.clamp(1, 200);
    let total: usize = conn
        .query_row("SELECT COUNT(*) FROM workbench_pdf_drafts", [], |r| {
            r.get(0)
        })
        .unwrap_or(0);

    let terms: Vec<String> = query
        .trim()
        .to_lowercase()
        .split_whitespace()
        .map(|s| s.to_string())
        .collect();

    let mut stmt = conn
        .prepare(
            "SELECT id, name, updated_at, marker_count, page_count, byte_length
             FROM workbench_pdf_drafts
             WHERE (?1 IS NULL OR updated_at < ?1 OR (updated_at = ?1 AND id < ?2))
             ORDER BY updated_at DESC, id DESC",
        )
        .map_err(|e| format!("查询草稿列表失败: {}", e))?;

    let rows = stmt
        .query_map(params![cursor_updated_at, cursor_id.unwrap_or("")], |r| {
            Ok(WorkbenchPdfSummary {
                id: r.get(0)?,
                name: r.get(1)?,
                updated_at: r.get(2)?,
                marker_count: r.get(3)?,
                page_count: r.get(4)?,
                byte_length: r.get::<_, i64>(5)?.max(0) as u64,
            })
        })
        .map_err(|e| format!("遍历草稿列表失败: {}", e))?;

    let mut items = Vec::with_capacity(limit);
    let mut has_more = false;
    for row in rows {
        let summary = row.map_err(|e| format!("解析草稿记录失败: {}", e))?;
        if !terms.is_empty() {
            let hay = format!("{}.pdf", summary.name).to_lowercase();
            if !terms.iter().all(|t| hay.contains(t)) {
                continue;
            }
        }
        if items.len() >= limit {
            has_more = true;
            break;
        }
        items.push(summary);
    }

    let (next_updated_at, next_id) = if has_more {
        if let Some(last) = items.last() {
            (Some(last.updated_at), Some(last.id.clone()))
        } else {
            (None, None)
        }
    } else {
        (None, None)
    };

    Ok(WorkbenchPdfPage {
        items,
        cursor_updated_at: next_updated_at,
        cursor_id: next_id,
        total,
    })
}

pub fn save_pdf_source(
    conn: &Connection,
    data_dir: &Path,
    meta: &SavePdfSourceMeta,
    pdf_bytes: Option<&[u8]>,
) -> Result<WorkbenchPdfSaveResult, String> {
    let id = validate_draft_id(&meta.id)?;
    ensure_workbench_dirs(data_dir)?;

    let abs_path = source_abs_path_for(data_dir, id);
    let rel_path = source_rel_path_for(id);

    // Content-addressed: only write PDF bytes when the source file does not already exist on disk.
    let byte_length: u64 = if abs_path.exists() {
        fs::metadata(&abs_path).map(|m| m.len()).unwrap_or(0)
    } else if let Some(bytes) = pdf_bytes {
        if bytes.is_empty() {
            return Err("PDF 原文件内容为空".to_string());
        }
        write_file_atomic(&abs_path, bytes)?;
        bytes.len() as u64
    } else {
        return Err("缺少 PDF 原文件数据".to_string());
    };

    let existing_rev: Option<i64> = conn
        .query_row(
            "SELECT revision FROM workbench_pdf_drafts WHERE id = ?1",
            params![id],
            |r| r.get(0),
        )
        .optional()
        .map_err(|e| format!("检查草稿版本失败: {}", e))?;

    let next_rev = existing_rev.unwrap_or(0) + 1;
    let view_str = meta.view_json.as_deref().unwrap_or("");
    let compat_int = if meta.compatibility { 1 } else { 0 };

    conn.execute(
        "INSERT INTO workbench_pdf_drafts (
            id, name, source_rel_path, byte_length, page_count, marker_count,
            markers_json, view_json, next_number, compatibility, revision, updated_at
        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)
        ON CONFLICT(id) DO UPDATE SET
            name = excluded.name,
            byte_length = excluded.byte_length,
            page_count = excluded.page_count,
            marker_count = excluded.marker_count,
            markers_json = excluded.markers_json,
            view_json = excluded.view_json,
            next_number = excluded.next_number,
            compatibility = excluded.compatibility,
            revision = excluded.revision,
            updated_at = excluded.updated_at",
        params![
            id,
            meta.name,
            rel_path,
            byte_length as i64,
            meta.page_count,
            meta.marker_count,
            meta.markers_json,
            view_str,
            meta.next_number,
            compat_int,
            next_rev,
            meta.updated_at,
        ],
    )
    .map_err(|e| format!("保存图纸草稿失败: {}", e))?;

    write_pdf_workspace_state(
        conn,
        &WorkbenchPdfWorkspaceState {
            active_id: Some(id.to_string()),
            screen: "document".to_string(),
        },
    )?;

    // Enforce configured LRU cache cap (protecting the currently saved document)
    let limit_mb = get_workbench_cache_limit_mb(conn);
    let prune = enforce_pdf_cache_limit(conn, data_dir, (limit_mb as u64) * 1024 * 1024, Some(id))?;

    Ok(WorkbenchPdfSaveResult {
        revision: next_rev,
        evicted_count: prune.evicted_count,
        freed_bytes: prune.freed_bytes,
    })
}

pub fn save_pdf_markers(
    conn: &Connection,
    input: &SavePdfMarkersInput,
) -> Result<i64, String> {
    let id = validate_draft_id(&input.id)?;
    let existing_rev: Option<i64> = conn
        .query_row(
            "SELECT revision FROM workbench_pdf_drafts WHERE id = ?1",
            params![id],
            |r| r.get(0),
        )
        .optional()
        .map_err(|e| format!("查询草稿失败: {}", e))?;

    let Some(rev) = existing_rev else {
        return Err("草稿记录不存在或已被清理，请重新打开图纸".to_string());
    };

    let next_rev = rev + 1;
    let view_str = input.view_json.as_deref().unwrap_or("");
    let compat_int = if input.compatibility { 1 } else { 0 };

    conn.execute(
        "UPDATE workbench_pdf_drafts
         SET marker_count = ?1, markers_json = ?2, view_json = ?3,
             next_number = ?4, compatibility = ?5, revision = ?6, updated_at = ?7
         WHERE id = ?8",
        params![
            input.marker_count,
            input.markers_json,
            view_str,
            input.next_number,
            compat_int,
            next_rev,
            input.updated_at,
            id,
        ],
    )
    .map_err(|e| format!("更新标注草稿失败: {}", e))?;

    if let Some(ref screen) = input.screen {
        write_pdf_workspace_state(
            conn,
            &WorkbenchPdfWorkspaceState {
                active_id: Some(id.to_string()),
                screen: if screen == "home" {
                    "home".to_string()
                } else {
                    "document".to_string()
                },
            },
        )?;
    }

    Ok(next_rev)
}

pub fn delete_pdf_draft(conn: &Connection, data_dir: &Path, id: &str) -> Result<(), String> {
    let id = validate_draft_id(id)?;
    conn.execute("DELETE FROM workbench_pdf_drafts WHERE id = ?1", params![id])
        .map_err(|e| format!("删除草稿记录失败: {}", e))?;

    let abs = source_abs_path_for(data_dir, id);
    if abs.exists() {
        let _ = fs::remove_file(&abs);
    }

    let nav = read_pdf_workspace_state(conn)?;
    if nav.active_id.as_deref() == Some(id) {
        write_pdf_workspace_state(
            conn,
            &WorkbenchPdfWorkspaceState {
                active_id: None,
                screen: "home".to_string(),
            },
        )?;
    }
    Ok(())
}

pub fn clear_all_pdf_drafts(conn: &Connection, data_dir: &Path) -> Result<WorkbenchCachePruneResult, String> {
    let before = get_workbench_cache_stats(conn, data_dir);
    conn.execute("DELETE FROM workbench_pdf_drafts", [])
        .map_err(|e| format!("清空草稿表失败: {}", e))?;
    conn.execute("DELETE FROM workbench_pdf_state", [])
        .map_err(|e| format!("清空工作台状态失败: {}", e))?;

    let wb_dir = workbench_root_dir(data_dir);
    if wb_dir.exists() {
        let _ = fs::remove_dir_all(&wb_dir);
    }
    ensure_workbench_dirs(data_dir)?;

    Ok(WorkbenchCachePruneResult {
        evicted_count: before.draft_count,
        freed_bytes: before.total_bytes,
        total_bytes: 0,
        draft_count: 0,
        limit_bytes: before.limit_bytes,
    })
}

/// Removes orphan `.pdf` or leftover `.tmp` files in `sources/` not tracked in SQLite.
pub fn reconcile_orphan_sources(conn: &Connection, data_dir: &Path) -> u64 {
    let sources_dir = pdf_sources_dir(data_dir);
    if !sources_dir.exists() {
        return 0;
    }
    let mut tracked = HashSet::new();
    if let Ok(mut stmt) = conn.prepare("SELECT id FROM workbench_pdf_drafts") {
        if let Ok(rows) = stmt.query_map([], |r| r.get::<_, String>(0)) {
            for id in rows.flatten() {
                tracked.insert(format!("{}.pdf", id));
            }
        }
    }

    let mut freed = 0u64;
    for entry in WalkDir::new(&sources_dir)
        .max_depth(1)
        .into_iter()
        .filter_map(|e| e.ok())
    {
        if !entry.file_type().is_file() {
            continue;
        }
        let name = entry.file_name().to_string_lossy().to_string();
        if !tracked.contains(&name) {
            if let Ok(meta) = entry.metadata() {
                freed += meta.len();
            }
            let _ = fs::remove_file(entry.path());
        }
    }
    freed
}

/// Evicts least-recently-used PDF drafts until total cached bytes <= `limit_bytes`,
/// never evicting `protected_id` (the currently open document).
pub fn enforce_pdf_cache_limit(
    conn: &Connection,
    data_dir: &Path,
    limit_bytes: u64,
    protected_id: Option<&str>,
) -> Result<WorkbenchCachePruneResult, String> {
    let mut freed_bytes = reconcile_orphan_sources(conn, data_dir);

    let mut stmt = conn
        .prepare("SELECT id, byte_length FROM workbench_pdf_drafts ORDER BY updated_at ASC, id ASC")
        .map_err(|e| format!("查询缓存容量失败: {}", e))?;

    let rows: Vec<(String, u64)> = stmt
        .query_map([], |r| {
            Ok((r.get::<_, String>(0)?, r.get::<_, i64>(1)?.max(0) as u64))
        })
        .map_err(|e| format!("遍历缓存容量失败: {}", e))?
        .filter_map(|r| r.ok())
        .collect();
    drop(stmt);

    let mut total_bytes: u64 = rows.iter().map(|(_, b)| *b).sum();
    let mut draft_count = rows.len();
    let mut evicted_count = 0usize;

    if total_bytes > limit_bytes {
        let nav = read_pdf_workspace_state(conn).ok();
        let mut nav_cleared = false;

        for (id, size) in rows {
            if total_bytes <= limit_bytes {
                break;
            }
            if protected_id == Some(id.as_str()) {
                continue;
            }
            conn.execute("DELETE FROM workbench_pdf_drafts WHERE id = ?1", params![id])
                .map_err(|e| format!("淘汰旧草稿失败: {}", e))?;
            let abs = source_abs_path_for(data_dir, &id);
            if abs.exists() {
                let _ = fs::remove_file(&abs);
            }
            total_bytes = total_bytes.saturating_sub(size);
            freed_bytes += size;
            draft_count = draft_count.saturating_sub(1);
            evicted_count += 1;

            if !nav_cleared && nav.as_ref().and_then(|n| n.active_id.as_deref()) == Some(id.as_str())
            {
                let _ = write_pdf_workspace_state(
                    conn,
                    &WorkbenchPdfWorkspaceState {
                        active_id: None,
                        screen: "home".to_string(),
                    },
                );
                nav_cleared = true;
            }
        }
    }

    Ok(WorkbenchCachePruneResult {
        evicted_count,
        freed_bytes,
        total_bytes,
        draft_count,
        limit_bytes,
    })
}

pub fn get_workbench_cache_stats(conn: &Connection, data_dir: &Path) -> WorkbenchCacheStats {
    let limit_mb = get_workbench_cache_limit_mb(conn);
    let limit_bytes = (limit_mb as u64) * 1024 * 1024;
    let draft_count: usize = conn
        .query_row("SELECT COUNT(*) FROM workbench_pdf_drafts", [], |r| r.get(0))
        .unwrap_or(0);
    let total_bytes = dir_total_size(&workbench_root_dir(data_dir));
    WorkbenchCacheStats {
        total_bytes,
        draft_count,
        limit_bytes,
        limit_mb,
    }
}

pub fn set_workbench_cache_limit_and_prune(
    conn: &Connection,
    data_dir: &Path,
    limit_mb: i64,
    protected_id: Option<&str>,
) -> Result<WorkbenchCachePruneResult, String> {
    let sanitized = sanitize_workbench_cache_limit_mb(limit_mb);
    set_setting(conn, "workbench_cache_limit_mb", &sanitized.to_string())?;
    enforce_pdf_cache_limit(conn, data_dir, (sanitized as u64) * 1024 * 1024, protected_id)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::init_db;

    fn sample_meta(id: &str, name: &str, updated_at: i64) -> SavePdfSourceMeta {
        SavePdfSourceMeta {
            id: id.to_string(),
            name: name.to_string(),
            page_count: 2,
            marker_count: 1,
            markers_json: "[{\"id\":\"m1\"}]".to_string(),
            view_json: Some("{\"page\":1,\"scale\":1,\"zoomMode\":\"fit\"}".to_string()),
            next_number: 2,
            compatibility: false,
            updated_at,
        }
    }

    #[test]
    fn test_content_addressed_save_read_and_lru_eviction() {
        let root = std::env::temp_dir().join(format!("wb_store_test_{}", Uuid::new_v4()));
        let data_dir = root.join("data");
        let db_path = data_dir.join("ledger.db");
        let conn = init_db(&db_path).unwrap();

        // Default limit should be 1024 MB (1 GB)
        assert_eq!(get_workbench_cache_limit_mb(&conn), 1024);

        // Save 3 synthetic PDFs (each 600 bytes)
        let bytes_a = vec![b'A'; 600];
        let bytes_b = vec![b'B'; 600];
        let bytes_c = vec![b'C'; 600];

        let r1 = save_pdf_source(&conn, &data_dir, &sample_meta("aaa111", "drawing-a", 100), Some(&bytes_a)).unwrap();
        assert_eq!(r1.revision, 1);
        let r2 = save_pdf_source(&conn, &data_dir, &sample_meta("bbb222", "drawing-b", 200), Some(&bytes_b)).unwrap();
        assert_eq!(r2.revision, 1);
        let r3 = save_pdf_source(&conn, &data_dir, &sample_meta("ccc333", "drawing-c", 300), Some(&bytes_c)).unwrap();
        assert_eq!(r3.revision, 1);

        // Saving markers only updates SQLite without touching source file
        let rev = save_pdf_markers(
            &conn,
            &SavePdfMarkersInput {
                id: "bbb222".to_string(),
                marker_count: 3,
                markers_json: "[1,2,3]".to_string(),
                view_json: None,
                next_number: 4,
                compatibility: false,
                updated_at: 400, // now most recently used!
                screen: None,
            },
        )
        .unwrap();
        assert_eq!(rev, 2);

        // Enforce 1250-byte limit protecting ccc333 -> should evict aaa111 (oldest at ts=100), keeping bbb222 (ts=400) & ccc333 (ts=300)
        let prune = enforce_pdf_cache_limit(&conn, &data_dir, 1250, Some("ccc333")).unwrap();
        assert_eq!(prune.evicted_count, 1);
        assert_eq!(prune.freed_bytes, 600);
        assert_eq!(prune.draft_count, 2);
        assert!(read_pdf_draft_meta(&conn, &data_dir, "aaa111").unwrap().is_none());
        assert!(read_pdf_draft_meta(&conn, &data_dir, "bbb222").unwrap().is_some());
        assert_eq!(read_pdf_source_bytes(&data_dir, "bbb222").unwrap(), bytes_b);

        // Search query should filter case-insensitively
        let page = list_pdf_drafts(&conn, None, None, 10, "DRAWING-B").unwrap();
        assert_eq!(page.items.len(), 1);
        assert_eq!(page.items[0].id, "bbb222");

        // Orphan file cleanup
        let orphan_path = pdf_sources_dir(&data_dir).join("orphan999.pdf");
        fs::write(&orphan_path, b"stale-data").unwrap();
        let freed = reconcile_orphan_sources(&conn, &data_dir);
        assert_eq!(freed, 10);
        assert!(!orphan_path.exists());

        // Clear all
        let cleared = clear_all_pdf_drafts(&conn, &data_dir).unwrap();
        assert_eq!(cleared.draft_count, 0);
        assert_eq!(cleared.total_bytes, 0);

        let _ = fs::remove_dir_all(&root);
    }
}
