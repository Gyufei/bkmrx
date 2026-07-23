use tauri::State;

use crate::bookmarks::{
    AppResult, Bookmark, BookmarkPage, BookmarkPageRequest, CreateBookmark, ImportPreview,
    SharedBookmarkService, TagSummary, UpdateBookmark,
};

#[tauri::command]
pub fn query_bookmarks(
    service: State<'_, SharedBookmarkService>,
    request: BookmarkPageRequest,
) -> AppResult<BookmarkPage> {
    service.query(request)
}

#[tauri::command]
pub fn create_bookmark(
    service: State<'_, SharedBookmarkService>,
    input: CreateBookmark,
) -> AppResult<Bookmark> {
    service.create(input)
}

#[tauri::command]
pub fn update_bookmark(
    service: State<'_, SharedBookmarkService>,
    id: i64,
    input: UpdateBookmark,
) -> AppResult<Bookmark> {
    service.update(id, input)
}

#[tauri::command]
pub fn delete_bookmarks(
    service: State<'_, SharedBookmarkService>,
    ids: Vec<i64>,
) -> AppResult<u64> {
    service.delete_many(ids)
}

#[tauri::command]
pub fn get_bookmark_by_url(
    service: State<'_, SharedBookmarkService>,
    url: String,
) -> AppResult<Option<Bookmark>> {
    service.get_by_url(url)
}

#[tauri::command]
pub fn get_tags(service: State<'_, SharedBookmarkService>) -> AppResult<Vec<TagSummary>> {
    service.get_tags()
}

#[tauri::command]
pub fn record_bookmark_access(
    service: State<'_, SharedBookmarkService>,
    id: i64,
) -> AppResult<Bookmark> {
    service.record_access(id)
}

#[tauri::command]
pub fn export_bookmarks(
    service: State<'_, SharedBookmarkService>,
    path: String,
) -> AppResult<String> {
    service
        .export_bookmarks(path)
        .map(|path| path.to_string_lossy().into_owned())
}

#[tauri::command]
pub fn preview_bookmark_import(
    service: State<'_, SharedBookmarkService>,
    path: String,
) -> AppResult<ImportPreview> {
    service.preview_bookmark_import(path)
}

#[tauri::command]
pub fn apply_bookmark_import(
    service: State<'_, SharedBookmarkService>,
    path: String,
    file_hash: String,
) -> AppResult<ImportPreview> {
    service.apply_bookmark_import(path, &file_hash)
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
pub fn get_settings(
    paths: State<'_, crate::settings::RuntimePaths>,
) -> AppResult<crate::settings::Settings> {
    crate::settings::load(paths.settings_path())
}

#[tauri::command]
pub fn update_settings(
    paths: State<'_, crate::settings::RuntimePaths>,
    settings: crate::settings::Settings,
) -> AppResult<()> {
    crate::settings::save(paths.settings_path(), &settings)
}

#[tauri::command]
pub async fn get_server_status() -> Result<crate::http_server::ServerStatus, String> {
    Ok(crate::http_server::status())
}

#[tauri::command]
pub async fn delete_note(path: String) -> Result<(), String> {
    crate::notes::delete_note_file(&path)
}

#[tauri::command]
pub async fn rename_note(old_path: String, new_path: String) -> Result<(), String> {
    crate::notes::rename_note_file(&old_path, &new_path)
}

#[tauri::command]
pub fn get_system_info(
    paths: State<'_, crate::settings::RuntimePaths>,
) -> AppResult<crate::settings::SystemInfo> {
    Ok(paths.system_info())
}
