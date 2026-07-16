use crate::bkmr;

#[tauri::command]
pub async fn load_all_bookmarks() -> Result<Vec<bkmr::BkmrBookmark>, String> {
    bkmr::get_all_bookmarks().await
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
pub async fn add_bookmark(url: String, title: String, tags: Vec<String>, description: Option<String>) -> Result<u64, String> {
    bkmr::add_bookmark(&url, &title, &tags, &description.unwrap_or_default()).await
}

#[tauri::command]
pub async fn delete_bookmarks(ids: Vec<u64>) -> Result<u64, String> {
    bkmr::delete_bookmarks(&ids).await
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
pub async fn check_bookmark(url: String) -> Result<Option<bkmr::BkmrBookmark>, String> {
    bkmr::check_bookmark(&url).await
}

#[tauri::command]
pub async fn show_bookmark(id: u64) -> Result<Option<bkmr::BkmrBookmark>, String> {
    bkmr::show_bookmark(id).await
}

#[tauri::command]
pub async fn update_bookmark(id: u64, title: String, tags: Vec<String>, description: Option<String>) -> Result<(), String> {
    bkmr::update_bookmark(id, &title, &tags, &description.unwrap_or_default()).await
}

#[tauri::command]
pub async fn delete_note(path: String) -> Result<(), String> {
    crate::notes::delete_note_file(&path)
}

#[tauri::command]
pub async fn rename_note(old_path: String, new_path: String) -> Result<(), String> {
    crate::notes::rename_note_file(&old_path, &new_path)
}
