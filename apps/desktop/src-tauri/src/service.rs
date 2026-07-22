use serde::Serialize;
use std::sync::OnceLock;
use bkmr_lib::domain::search::{HybridSearch, SearchMode};
use tauri::Emitter;

// ─── Shared data types ───

#[derive(Debug, Clone, Serialize)]
pub struct BkmrBookmark {
    pub access_count: i32,
    pub created_at: Option<String>,
    pub id: u64,
    pub url: String,
    pub title: String,
    pub tags: Vec<String>,
    #[serde(default)]
    pub description: String,
    #[serde(default)]
    pub modified: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct BkmrTag {
    pub name: String,
    pub count: u64,
}

// ─── Event notification (used by http_server to push to frontend) ───

static BOOKMARK_EVENT_HANDLE: OnceLock<tauri::AppHandle> = OnceLock::new();

pub fn init_event_handle(handle: tauri::AppHandle) {
    BOOKMARK_EVENT_HANDLE.set(handle).ok();
}

pub fn notify_bookmarks_changed() {
    if let Some(handle) = BOOKMARK_EVENT_HANDLE.get() {
        let _ = handle.emit("bookmarks-changed", ());
    }
}

// ─── Conversion helpers ───

pub fn to_tag_set(tags: &[String]) -> std::collections::HashSet<bkmr_lib::domain::tag::Tag> {
    use std::collections::HashSet;
    if tags.is_empty() {
        return HashSet::new();
    }
    let joined = tags.join(",");
    bkmr_lib::domain::tag::Tag::parse_tag_str(&joined)
        .ok()
        .flatten()
        .unwrap_or_default()
}

fn bookmark_to_bkmr(b: &bkmr_lib::domain::bookmark::Bookmark) -> BkmrBookmark {
    BkmrBookmark {
        id: b.id.unwrap_or(0) as u64,
        url: b.url.clone(),
        title: b.title.clone(),
        tags: b.tags.iter().map(|t| t.value().to_string()).collect(),
        access_count: b.access_count,
        created_at: b.created_at.map(|t| t.to_rfc3339()),
        description: b.description.clone(),
        modified: b.updated_at.to_rfc3339(),
    }
}

// ─── Shared bookmark operations ───

pub fn add_bookmark(
    url: &str,
    title: &str,
    tags: &[String],
    description: Option<&str>,
) -> Result<BkmrBookmark, String> {
    let container = crate::container::get();
    let tag_set = to_tag_set(tags);
    let bookmark = container
        .bookmark_service
        .add_bookmark(url, Some(title), description, Some(&tag_set), false, true, None)
        .map_err(|e| e.to_string())?;
    Ok(bookmark_to_bkmr(&bookmark))
}

pub fn update_bookmark(
    id: u64,
    title: &str,
    tags: &[String],
    description: &str,
) -> Result<(), String> {
    let container = crate::container::get();
    let mut bookmark = container
        .bookmark_service
        .get_bookmark(id as i32)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "Bookmark not found".to_string())?;
    bookmark.title = title.to_string();
    bookmark.description = description.to_string();
    bookmark.tags = to_tag_set(tags);
    bookmark.updated_at = chrono::Utc::now();
    container
        .bookmark_service
        .update_bookmark(bookmark, false)
        .map_err(|e| e.to_string())?;
    Ok(())
}

pub fn delete_bookmark(id: u64) -> Result<(), String> {
    let container = crate::container::get();
    container
        .bookmark_service
        .delete_bookmark(id as i32)
        .map_err(|e| e.to_string())?;
    Ok(())
}

pub fn get_bookmark(id: u64) -> Result<Option<BkmrBookmark>, String> {
    let container = crate::container::get();
    container
        .bookmark_service
        .get_bookmark(id as i32)
        .map_err(|e| e.to_string())
        .map(|opt| opt.map(|b| bookmark_to_bkmr(&b)))
}

pub fn get_bookmark_by_url(url: &str) -> Result<Option<BkmrBookmark>, String> {
    let container = crate::container::get();
    container
        .bookmark_service
        .get_bookmark_by_url(url)
        .map_err(|e| e.to_string())
        .map(|opt| opt.map(|b| bookmark_to_bkmr(&b)))
}

pub fn get_all_tags() -> Result<Vec<BkmrTag>, String> {
    let container = crate::container::get();
    let tags = container
        .tag_service
        .get_all_tags()
        .map_err(|e| e.to_string())?;
    Ok(tags
        .into_iter()
        .map(|(tag, count)| BkmrTag {
            name: tag.value().to_string(),
            count: count as u64,
        })
        .collect())
}

pub fn hybrid_search_bookmarks(
    query: &str,
    tags: &[String],
) -> Result<Vec<BkmrBookmark>, String> {
    let container = crate::container::get();

    // No text query → load all and filter by tags in memory
    if query.trim().is_empty() {
        let all = container
            .bookmark_service
            .get_all_bookmarks(None, None)
            .map_err(|e| e.to_string())?;
        let bookmarks: Vec<BkmrBookmark> = all.iter().map(|b| bookmark_to_bkmr(b)).collect();
        if tags.is_empty() {
            return Ok(bookmarks);
        }
        let tag_set: std::collections::HashSet<&str> = tags.iter().map(String::as_str).collect();
        return Ok(bookmarks
            .into_iter()
            .filter(|b| tag_set.iter().all(|t| b.tags.iter().any(|bt| bt == t)))
            .collect());
    }

    // Normal hybrid search with FTS5
    let tag_set = to_tag_set(tags);
    let search = HybridSearch {
        query: format!("{}*", query.trim()),
        tags_all: if tag_set.is_empty() {
            None
        } else {
            Some(tag_set)
        },
        tags_all_not: None,
        tags_any: None,
        tags_any_not: None,
        tags_exact: None,
        tags_prefix: None,
        limit: None,
        mode: SearchMode::Hybrid,
    };

    let results = container
        .bookmark_service
        .hybrid_search(&search)
        .map_err(|e| e.to_string())?;

    Ok(results
        .iter()
        .map(|r| bookmark_to_bkmr(&r.bookmark))
        .collect())
}

pub fn backup_bookmarks(dir: &str) -> Result<String, String> {
    let container = crate::container::get();
    let bookmarks = container
        .bookmark_service
        .get_all_bookmarks(None, None)
        .map_err(|e| e.to_string())?;
    let json_list: Vec<serde_json::Value> = bookmarks
        .iter()
        .map(|b| {
            serde_json::json!({
                "id": b.id,
                "url": b.url,
                "title": b.title,
                "description": b.description,
                "tags": b.tags.iter().map(|t| t.value()).collect::<Vec<&str>>(),
                "modified": b.updated_at.to_rfc3339(),
            })
        })
        .collect();
    let json = serde_json::to_string_pretty(&json_list).map_err(|e| e.to_string())?;
    let date = chrono::Local::now().format("%Y-%m-%d").to_string();
    let path = std::path::Path::new(dir).join(format!("bookmarks-{date}.json"));
    std::fs::write(&path, &json).map_err(|e| e.to_string())?;
    Ok(path.to_string_lossy().to_string())
}
