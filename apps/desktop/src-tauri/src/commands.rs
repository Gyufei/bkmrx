use serde::Serialize;

#[tauri::command]
pub async fn load_all_bookmarks() -> Result<Vec<crate::service::BkmrBookmark>, String> {
    crate::service::hybrid_search_bookmarks("", &[])
}

#[tauri::command]
pub async fn get_all_tags() -> Result<Vec<crate::service::BkmrTag>, String> {
    crate::service::get_all_tags()
}

#[tauri::command]
pub async fn backup_bookmarks(dir: String) -> Result<String, String> {
    crate::service::backup_bookmarks(&dir)
}

#[tauri::command]
pub async fn add_bookmark(url: String, title: String, tags: Vec<String>, description: Option<String>) -> Result<u64, String> {
    let bm = crate::service::add_bookmark(&url, &title, &tags, description.as_deref())?;
    Ok(bm.id)
}

#[tauri::command]
pub async fn delete_bookmarks(ids: Vec<u64>) -> Result<u64, String> {
    for id in &ids {
        crate::service::delete_bookmark(*id)?;
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
) -> Result<Vec<crate::service::BkmrBookmark>, String> {
    crate::service::hybrid_search_bookmarks(&query, &tags)
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
pub async fn check_bookmark(url: String) -> Result<Option<crate::service::BkmrBookmark>, String> {
    crate::service::get_bookmark_by_url(&url)
}

#[tauri::command]
pub async fn show_bookmark(id: u64) -> Result<Option<crate::service::BkmrBookmark>, String> {
    crate::service::get_bookmark(id)
}

#[tauri::command]
pub async fn update_bookmark(id: u64, title: String, tags: Vec<String>, description: Option<String>) -> Result<(), String> {
    crate::service::update_bookmark(id, &title, &tags, &description.unwrap_or_default())
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
