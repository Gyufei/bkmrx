use serde::Serialize;
use bkmr_lib::domain::search::{HybridSearch, SearchMode};

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


pub(crate) fn to_tag_set(tags: &[String]) -> std::collections::HashSet<bkmr_lib::domain::tag::Tag> {
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

fn to_bkmr_bookmark(b: &bkmr_lib::domain::bookmark::Bookmark) -> BkmrBookmark {
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


#[tauri::command]
pub async fn load_all_bookmarks() -> Result<Vec<BkmrBookmark>, String> {
    let container = crate::container::get();
    let bookmarks = container.bookmark_service
        .get_all_bookmarks(None, None)
        .map_err(|e| e.to_string())?;
    Ok(bookmarks.iter().map(|b| to_bkmr_bookmark(b)).collect())
}

#[tauri::command]
pub async fn get_all_tags() -> Result<Vec<BkmrTag>, String> {
    let container = crate::container::get();
    let tags = container.tag_service
        .get_all_tags()
        .map_err(|e| e.to_string())?;
    Ok(tags.into_iter().map(|(tag, count)| BkmrTag {
        name: tag.value().to_string(),
        count: count as u64,
    }).collect())
}

#[tauri::command]
pub async fn backup_bookmarks(dir: String) -> Result<String, String> {
    let container = crate::container::get();
    let bookmarks = container.bookmark_service
        .get_all_bookmarks(None, None)
        .map_err(|e| e.to_string())?;
    let json_list: Vec<serde_json::Value> = bookmarks.iter().map(|b| serde_json::json!({
        "id": b.id,
        "url": b.url,
        "title": b.title,
        "description": b.description,
        "tags": b.tags.iter().map(|t| t.value()).collect::<Vec<&str>>(),
        "modified": b.updated_at.to_rfc3339(),
    })).collect();
    let json = serde_json::to_string_pretty(&json_list).map_err(|e| e.to_string())?;
    let date = chrono::Local::now().format("%Y-%m-%d").to_string();
    let path = std::path::Path::new(&dir).join(format!("bookmarks-{date}.json"));
    std::fs::write(&path, &json).map_err(|e| e.to_string())?;
    Ok(path.to_string_lossy().to_string())
}

#[tauri::command]
pub async fn add_bookmark(url: String, title: String, tags: Vec<String>, description: Option<String>) -> Result<u64, String> {
    let container = crate::container::get();
    let tag_set = to_tag_set(&tags);
    let bookmark = container.bookmark_service
        .add_bookmark(&url, Some(&title), description.as_deref(), Some(&tag_set), false, true, None)
        .map_err(|e| e.to_string())?;
    Ok(bookmark.id.unwrap_or(0) as u64)
}

#[tauri::command]
pub async fn delete_bookmarks(ids: Vec<u64>) -> Result<u64, String> {
    let container = crate::container::get();
    for id in &ids {
        container.bookmark_service
            .delete_bookmark(*id as i32)
            .map_err(|e| e.to_string())?;
    }
    Ok(ids.len() as u64)
}

#[tauri::command]
pub async fn record_bookmark_access(id: u64) -> Result<(), String> {
    let container = crate::container::get();
    container.bookmark_service
        .record_bookmark_access(id as i32)
        .map_err(|e| e.to_string())?;
    Ok(())
}
#[tauri::command]
pub async fn hybrid_search_bookmarks(
    query: String,
    tags: Vec<String>,
) -> Result<Vec<BkmrBookmark>, String> {
    let container = crate::container::get();

    // When there is no text query, skip FTS5 (which rejects empty strings)
    // and just load all bookmarks, filtering by tags manually.
    if query.trim().is_empty() {
        let all = container
            .bookmark_service
            .get_all_bookmarks(None, None)
            .map_err(|e| e.to_string())?;
        let bookmarks: Vec<BkmrBookmark> = all.iter().map(|b| to_bkmr_bookmark(b)).collect();
        if tags.is_empty() {
            return Ok(bookmarks);
        }
        let tag_set: std::collections::HashSet<&str> = tags.iter().map(String::as_str).collect();
        return Ok(bookmarks
            .into_iter()
            .filter(|b| tag_set.iter().all(|t| b.tags.iter().any(|bt| bt == t)))
            .collect());
    }

    // Normal hybrid search with a valid FTS5 query
    let tag_set = to_tag_set(&tags);
    let search = HybridSearch {
        query: format!("{}*", query.trim()),
        tags_all: if tag_set.is_empty() { None } else { Some(tag_set) },
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

    Ok(results.iter().map(|r| to_bkmr_bookmark(&r.bookmark)).collect())
}


#[tauri::command]
pub async fn scan_notes(dir: String) -> Result<Vec<crate::notes::NoteFile>, String> {
    crate::notes::scan_notes(&dir)
}

#[tauri::command]
pub async fn read_note_file(path: String) -> Result<String, String> {
    crate::notes::read_note_file(&path)
}

#[tauri::command]
pub async fn write_note_file(path: String, content: String) -> Result<(), String> {
    crate::notes::write_note_file(&path, &content)
}

#[tauri::command]
pub async fn create_note_file(dir: String, name: String) -> Result<String, String> {
    crate::notes::create_note_file(&dir, &name)
}

#[tauri::command]
pub async fn get_settings() -> Result<crate::settings::Settings, String> {
    Ok(crate::settings::load())
}

#[tauri::command]
pub async fn update_settings(settings: crate::settings::Settings) -> Result<(), String> {
    crate::settings::save(&settings)
}

#[tauri::command]
pub async fn get_server_status() -> Result<crate::http_server::ServerStatus, String> {
    Ok(crate::http_server::status())
}

#[tauri::command]
pub async fn check_bookmark(url: String) -> Result<Option<BkmrBookmark>, String> {
    let container = crate::container::get();
    let bm = container.bookmark_service
        .get_bookmark_by_url(&url)
        .map_err(|e| e.to_string())?;
    Ok(bm.map(|b| to_bkmr_bookmark(&b)))
}

#[tauri::command]
pub async fn show_bookmark(id: u64) -> Result<Option<BkmrBookmark>, String> {
    let container = crate::container::get();
    let bm = container.bookmark_service
        .get_bookmark(id as i32)
        .map_err(|e| e.to_string())?;
    Ok(bm.map(|b| to_bkmr_bookmark(&b)))
}

#[tauri::command]
pub async fn update_bookmark(id: u64, title: String, tags: Vec<String>, description: Option<String>) -> Result<(), String> {
    let container = crate::container::get();
    let existing = container.bookmark_service
        .get_bookmark(id as i32)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "Bookmark not found".to_string())?;
    let mut updated = existing.clone();
    updated.title = title;
    updated.description = description.unwrap_or_default();
    updated.tags = to_tag_set(&tags);
    updated.updated_at = chrono::Utc::now();
    container.bookmark_service
        .update_bookmark(updated, false)
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn delete_note(path: String) -> Result<(), String> {
    crate::notes::delete_note_file(&path)
}

#[tauri::command]
pub async fn rename_note(old_path: String, new_path: String) -> Result<(), String> {
    crate::notes::rename_note_file(&old_path, &new_path)
}

#[derive(Debug, Clone, Serialize)]
pub struct SystemInfo {
    pub bkmr_config_path: String,
    pub sqlite_db_path: String,
    pub onnx_available: bool,
    pub bkmr_version: String,
    pub bkmr_repo: String,
    pub app_version: String,
}

#[tauri::command]
pub async fn get_system_info() -> Result<SystemInfo, String> {
    let config_path = bkmr_lib::config::get_config_file_path()
        .map(|p| p.to_string_lossy().to_string())
        .unwrap_or_else(|| "unknown".to_string());

    let db_path = crate::container::get_db_path().to_string();
    let onnx_available = crate::container::is_embedding_available();

    Ok(SystemInfo {
        bkmr_config_path: config_path,
        sqlite_db_path: db_path,
        onnx_available,
        bkmr_version: "7.6.7".to_string(),
        bkmr_repo: "https://github.com/sysid/bkmr".to_string(),
        app_version: env!("CARGO_PKG_VERSION").to_string(),
    })
}
