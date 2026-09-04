use tauri::State;

use crate::bookmarks::{
    Bookmark, BookmarkPage, BookmarkPageRequest, CreateBookmark, ImportPreview,
    SharedBookmarkService, TagQueryRequest, TagSummary, UpdateBookmark,
};
use crate::error::AppResult;
use crate::notes::SharedNoteService;
use crate::preview::{BookmarkPreview, PrepareBookmarkPreviewRequest, SharedPreviewService};
use crate::rss::{
    CreateFeed, EntryPage, EntryPageRequest, FeedPreview, FeedRefreshResult, RefreshResult,
    RssEntry, RssFeed, SharedRssService,
};
use crate::todos::{
    CreateTodo, SharedTodoService, Todo, TodoList, TodoQuery, TodoStatus, TodoTag, UpdateTodo,
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
pub fn get_tags(
    service: State<'_, SharedBookmarkService>,
    request: TagQueryRequest,
) -> AppResult<Vec<TagSummary>> {
    service.get_tags(request)
}

#[tauri::command]
pub fn record_bookmark_access(
    service: State<'_, SharedBookmarkService>,
    id: i64,
) -> AppResult<Bookmark> {
    service.record_access(id)
}

#[tauri::command]
pub fn set_bookmark_starred(
    service: State<'_, SharedBookmarkService>,
    id: i64,
    starred: bool,
) -> AppResult<Bookmark> {
    service.set_starred(id, starred)
}

#[tauri::command]
pub async fn prepare_bookmark_preview(
    service: State<'_, SharedPreviewService>,
    request: PrepareBookmarkPreviewRequest,
    force_refresh: bool,
) -> AppResult<BookmarkPreview> {
    Ok(service.prepare(request, force_refresh).await)
}

#[tauri::command]
pub async fn preview_rss_feed(
    service: State<'_, SharedRssService>,
    url: String,
) -> AppResult<FeedPreview> {
    service.preview(&url).await
}

#[tauri::command]
pub async fn create_rss_feed(
    service: State<'_, SharedRssService>,
    input: CreateFeed,
) -> AppResult<RssFeed> {
    service.create(input).await
}

#[tauri::command]
pub fn list_rss_feeds(service: State<'_, SharedRssService>) -> AppResult<Vec<RssFeed>> {
    service.list_feeds()
}

#[tauri::command]
pub fn list_rss_entries(
    service: State<'_, SharedRssService>,
    request: EntryPageRequest,
) -> AppResult<EntryPage> {
    service.list_entries(&request)
}

#[tauri::command]
pub async fn refresh_rss_feed(
    service: State<'_, SharedRssService>,
    id: i64,
) -> AppResult<FeedRefreshResult> {
    service.refresh_feed(id).await
}

#[tauri::command]
pub async fn refresh_all_rss_feeds(
    service: State<'_, SharedRssService>,
    stale_only: bool,
) -> AppResult<RefreshResult> {
    service.refresh_all(stale_only).await
}

#[tauri::command]
pub fn mark_rss_entry_read(
    service: State<'_, SharedRssService>,
    id: i64,
    is_read: bool,
) -> AppResult<RssEntry> {
    service.mark_entry_read(id, is_read)
}

#[tauri::command]
pub fn rename_rss_feed(
    service: State<'_, SharedRssService>,
    id: i64,
    custom_title: Option<String>,
) -> AppResult<RssFeed> {
    service.rename_feed(id, custom_title.as_deref())
}

#[tauri::command]
pub fn delete_rss_feed(service: State<'_, SharedRssService>, id: i64) -> AppResult<()> {
    service.delete_feed(id)
}

#[tauri::command]
pub async fn download_rss_image(
    url: String,
    referer: Option<String>,
    destination: String,
) -> AppResult<()> {
    crate::rss::download_image(&url, referer.as_deref(), std::path::Path::new(&destination)).await
}

#[tauri::command]
pub fn query_todos(
    service: State<'_, SharedTodoService>,
    request: TodoQuery,
) -> AppResult<TodoList> {
    service.query(request)
}

#[tauri::command]
pub fn get_todo_tags(service: State<'_, SharedTodoService>) -> AppResult<Vec<TodoTag>> {
    service.tags()
}

#[tauri::command]
pub fn create_todo(service: State<'_, SharedTodoService>, input: CreateTodo) -> AppResult<Todo> {
    service.create(input)
}

#[tauri::command]
pub fn update_todo(
    service: State<'_, SharedTodoService>,
    id: i64,
    input: UpdateTodo,
) -> AppResult<Todo> {
    service.update(id, input)
}

#[tauri::command]
pub fn set_todo_status(
    service: State<'_, SharedTodoService>,
    id: i64,
    status: TodoStatus,
) -> AppResult<Todo> {
    service.set_status(id, status)
}

#[tauri::command]
pub fn delete_todo(service: State<'_, SharedTodoService>, id: i64) -> AppResult<()> {
    service.delete(id)
}

#[tauri::command]
pub fn rename_todo_tag(
    service: State<'_, SharedTodoService>,
    id: i64,
    name: String,
) -> AppResult<TodoTag> {
    service.rename_tag(id, name)
}

#[tauri::command]
pub fn delete_todo_tag(service: State<'_, SharedTodoService>, id: i64) -> AppResult<()> {
    service.delete_tag(id)
}

#[tauri::command]
pub fn archive_delete_todo_tag(service: State<'_, SharedTodoService>, id: i64) -> AppResult<()> {
    service.archive_delete_tag(id)
}

#[tauri::command]
pub fn export_todos(
    service: State<'_, SharedTodoService>,
    path: String,
    tag_id: Option<i64>,
) -> AppResult<String> {
    service
        .export_todos(path, tag_id)
        .map(|path| path.to_string_lossy().into_owned())
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
pub async fn scan_notes(
    service: State<'_, SharedNoteService>,
    dir: String,
) -> crate::error::AppResult<Vec<crate::notes::NoteFile>> {
    service.scan(&dir)
}

#[tauri::command]
pub async fn read_note_file(
    service: State<'_, SharedNoteService>,
    path: String,
) -> crate::error::AppResult<String> {
    service.read(&path)
}

#[tauri::command]
pub async fn write_note_file(
    service: State<'_, SharedNoteService>,
    path: String,
    content: String,
) -> crate::error::AppResult<()> {
    service.write(&path, &content)
}

#[tauri::command]
pub async fn create_note_file(
    service: State<'_, SharedNoteService>,
    dir: String,
    name: String,
) -> crate::error::AppResult<String> {
    service.create(&dir, &name)
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
pub async fn delete_note(
    service: State<'_, SharedNoteService>,
    path: String,
) -> crate::error::AppResult<()> {
    service.delete(&path)
}

#[tauri::command]
pub async fn delete_note_folder(
    service: State<'_, SharedNoteService>,
    path: String,
) -> crate::error::AppResult<()> {
    service.delete_folder(&path)
}

#[tauri::command]
pub async fn rename_note(
    service: State<'_, SharedNoteService>,
    old_path: String,
    new_path: String,
) -> crate::error::AppResult<()> {
    service.rename(&old_path, &new_path)
}

#[tauri::command]
pub fn get_system_info(
    paths: State<'_, crate::settings::RuntimePaths>,
) -> AppResult<crate::settings::SystemInfo> {
    Ok(paths.system_info())
}
