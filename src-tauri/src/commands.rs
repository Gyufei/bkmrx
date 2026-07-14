use crate::bkmr;

#[tauri::command]
pub async fn load_all_bookmarks() -> Result<Vec<bkmr::BkmrBookmark>, String> {
    bkmr::get_all_bookmarks().await
}

#[tauri::command]
pub async fn search_bookmarks(
    query: Option<String>,
    tags: Vec<String>,
) -> Result<Vec<bkmr::BkmrBookmark>, String> {
    match (query, tags.as_slice()) {
        (Some(q), _) if !q.trim().is_empty() => {
            bkmr::hsearch(q.trim(), &tags).await
        }
        (_, []) => Ok(Vec::new()),
        _ => bkmr::search_by_tags(&tags).await,
    }
}

#[tauri::command]
pub async fn get_all_tags() -> Result<Vec<bkmr::BkmrTag>, String> {
    bkmr::get_tags().await
}

#[tauri::command]
pub async fn backup_bookmarks(dir: String) -> Result<String, String> {
    bkmr::export_all(&dir).await
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
