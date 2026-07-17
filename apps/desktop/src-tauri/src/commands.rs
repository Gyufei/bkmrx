use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
pub struct BkmrBookmark {
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


fn to_tag_set(tags: &[String]) -> std::collections::HashSet<bkmr_lib::domain::tag::Tag> {
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
    Ok(bookmarks.iter().map(|b| BkmrBookmark {
        id: b.id.unwrap_or(0) as u64,
        url: b.url.clone(),
        title: b.title.clone(),
        tags: b.tags.iter().map(|t| t.value().to_string()).collect(),
        description: b.description.clone(),
        modified: b.updated_at.to_rfc3339(),
    }).collect())
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
