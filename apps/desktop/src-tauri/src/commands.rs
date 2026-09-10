use tauri::State;

use crate::bookmarks::{
    Bookmark, BookmarkInitializationResult, BookmarkInitializationStatus, BookmarkPage,
    BookmarkPageRequest, CreateBookmark, SharedBookmarkStore, TagQueryRequest, TagSummary,
    UpdateBookmark,
};
use crate::error::AppResult;
use crate::identity::BookmarkId;
use crate::navigation::{
    AddNavigationBookmarks, CreateNavigationCategory, NavigationCategory, NavigationPlacementCard,
    NavigationSection, SharedNavigationStore, UpdateNavigationCategory,
};
use crate::notes::SharedNotesWorkspace;
use crate::preview::{BookmarkPreview, PrepareBookmarkPreviewRequest, SharedPreviewService};
use crate::rss::{
    CreateFeed, EntryPage, EntryPageRequest, FeedPreview, FeedRefreshResult, RefreshResult,
    RssEntry, RssFeed, SharedRssService,
};
use crate::todos::{
    CreateTodo, SharedTodoStore, Todo, TodoList, TodoQuery, TodoStatus, TodoTag, UpdateTodo,
};

#[tauri::command]
pub fn list_navigation_sections(
    service: State<'_, SharedNavigationStore>,
) -> AppResult<Vec<NavigationSection>> {
    service.list_sections()
}

#[tauri::command]
pub fn create_navigation_category(
    service: State<'_, SharedNavigationStore>,
    input: CreateNavigationCategory,
) -> AppResult<NavigationCategory> {
    service.create_category(input)
}

#[tauri::command]
pub fn update_navigation_category(
    service: State<'_, SharedNavigationStore>,
    id: crate::identity::NavigationCategoryId,
    input: UpdateNavigationCategory,
) -> AppResult<NavigationCategory> {
    service.update_category(id, input)
}

#[tauri::command]
pub fn delete_navigation_category(
    service: State<'_, SharedNavigationStore>,
    id: crate::identity::NavigationCategoryId,
) -> AppResult<()> {
    service.delete_category(id)
}

#[tauri::command]
pub fn add_navigation_bookmarks(
    service: State<'_, SharedNavigationStore>,
    category_id: crate::identity::NavigationCategoryId,
    input: AddNavigationBookmarks,
) -> AppResult<Vec<NavigationPlacementCard>> {
    service.add_bookmarks(category_id, input)
}

#[tauri::command]
pub fn remove_navigation_bookmark(
    service: State<'_, SharedNavigationStore>,
    category_id: crate::identity::NavigationCategoryId,
    bookmark_id: BookmarkId,
) -> AppResult<()> {
    service.remove_bookmark(category_id, bookmark_id)
}

#[tauri::command]
pub fn query_bookmarks(
    service: State<'_, SharedBookmarkStore>,
    request: BookmarkPageRequest,
) -> AppResult<BookmarkPage> {
    service.query(request)
}

#[tauri::command]
pub fn create_bookmark(
    service: State<'_, SharedBookmarkStore>,
    input: CreateBookmark,
) -> AppResult<Bookmark> {
    service.create(input)
}

#[tauri::command]
pub fn update_bookmark(
    service: State<'_, SharedBookmarkStore>,
    id: BookmarkId,
    input: UpdateBookmark,
) -> AppResult<Bookmark> {
    service.update(id, input)
}

#[tauri::command]
pub fn delete_bookmarks(
    service: State<'_, SharedBookmarkStore>,
    ids: Vec<BookmarkId>,
) -> AppResult<u64> {
    service.delete_many(&ids)
}

#[tauri::command]
pub fn get_bookmark_by_url(
    service: State<'_, SharedBookmarkStore>,
    url: String,
) -> AppResult<Option<Bookmark>> {
    service.find_by_url(&url)
}

#[tauri::command]
pub fn get_tags(
    service: State<'_, SharedBookmarkStore>,
    request: TagQueryRequest,
) -> AppResult<Vec<TagSummary>> {
    service.tags(request)
}

#[tauri::command]
pub fn record_bookmark_access(
    service: State<'_, SharedBookmarkStore>,
    id: BookmarkId,
) -> AppResult<Bookmark> {
    service.record_access(id)
}

#[tauri::command]
pub fn set_bookmark_starred(
    service: State<'_, SharedBookmarkStore>,
    id: BookmarkId,
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
    id: crate::identity::RssFeedId,
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
    id: crate::identity::RssEntryId,
    is_read: bool,
) -> AppResult<RssEntry> {
    service.mark_entry_read(id, is_read)
}

#[tauri::command]
pub fn rename_rss_feed(
    service: State<'_, SharedRssService>,
    id: crate::identity::RssFeedId,
    custom_title: Option<String>,
) -> AppResult<RssFeed> {
    service.rename_feed(id, custom_title.as_deref())
}

#[tauri::command]
pub fn delete_rss_feed(
    service: State<'_, SharedRssService>,
    id: crate::identity::RssFeedId,
) -> AppResult<()> {
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
pub fn query_todos(service: State<'_, SharedTodoStore>, request: TodoQuery) -> AppResult<TodoList> {
    service.query(request)
}

#[tauri::command]
pub fn get_todo_tags(service: State<'_, SharedTodoStore>) -> AppResult<Vec<TodoTag>> {
    service.tags()
}

#[tauri::command]
pub fn create_todo(service: State<'_, SharedTodoStore>, input: CreateTodo) -> AppResult<Todo> {
    service.create(input)
}

#[tauri::command]
pub fn update_todo(
    service: State<'_, SharedTodoStore>,
    id: crate::identity::TodoId,
    input: UpdateTodo,
) -> AppResult<Todo> {
    service.update(id, input)
}

#[tauri::command]
pub fn set_todo_status(
    service: State<'_, SharedTodoStore>,
    id: crate::identity::TodoId,
    status: TodoStatus,
) -> AppResult<Todo> {
    service.set_status(id, status)
}

#[tauri::command]
pub fn delete_todo(
    service: State<'_, SharedTodoStore>,
    id: crate::identity::TodoId,
) -> AppResult<()> {
    service.delete(id)
}

#[tauri::command]
pub fn rename_todo_tag(
    service: State<'_, SharedTodoStore>,
    id: crate::identity::TodoTagId,
    name: String,
) -> AppResult<TodoTag> {
    service.rename_tag(id, name)
}

#[tauri::command]
pub fn delete_todo_tag(
    service: State<'_, SharedTodoStore>,
    id: crate::identity::TodoTagId,
) -> AppResult<()> {
    service.delete_tag(id)
}

#[tauri::command]
pub fn archive_delete_todo_tag(
    service: State<'_, SharedTodoStore>,
    id: crate::identity::TodoTagId,
) -> AppResult<()> {
    service.archive_delete_tag(id)
}

#[tauri::command]
pub fn export_todos(
    service: State<'_, SharedTodoStore>,
    path: String,
    tag_id: Option<crate::identity::TodoTagId>,
) -> AppResult<String> {
    service
        .export_todos(path, tag_id)
        .map(|path| path.to_string_lossy().into_owned())
}

#[tauri::command]
pub fn export_bookmark_dataset(
    service: State<'_, SharedBookmarkStore>,
    path: String,
) -> AppResult<String> {
    service
        .export(std::path::Path::new(&path))
        .map(|path| path.to_string_lossy().into_owned())
}

#[tauri::command]
pub fn get_bookmark_initialization_status(
    service: State<'_, SharedBookmarkStore>,
) -> AppResult<BookmarkInitializationStatus> {
    service.initialization_status()
}

#[tauri::command]
pub fn initialize_bookmarks(
    service: State<'_, SharedBookmarkStore>,
    path: String,
) -> AppResult<BookmarkInitializationResult> {
    service.initialize(std::path::Path::new(&path))
}

#[tauri::command]
pub async fn scan_notes(
    workspace: State<'_, SharedNotesWorkspace>,
) -> crate::error::AppResult<crate::notes::NotesWorkspaceListing> {
    workspace.list()
}

#[tauri::command]
pub async fn open_note_document(
    workspace: State<'_, SharedNotesWorkspace>,
    revision: u64,
    relative_path: String,
) -> crate::error::AppResult<crate::notes::OpenedDocument> {
    workspace.open_document(revision, &relative_path)
}

#[tauri::command]
pub async fn save_note_document(
    workspace: State<'_, SharedNotesWorkspace>,
    receipt: String,
    content: String,
) -> crate::error::AppResult<crate::notes::SavedDocument> {
    workspace.save_document(&receipt, &content)
}

#[tauri::command]
pub async fn rename_note_document(
    workspace: State<'_, SharedNotesWorkspace>,
    receipt: String,
    name: String,
    pending_content: Option<String>,
) -> crate::error::AppResult<crate::notes::RenamedDocument> {
    workspace.rename_document(&receipt, &name, pending_content.as_deref())
}

#[tauri::command]
pub async fn delete_note_document(
    workspace: State<'_, SharedNotesWorkspace>,
    receipt: String,
) -> crate::error::AppResult<()> {
    workspace.delete_document(&receipt)
}

#[tauri::command]
pub async fn create_note_file(
    workspace: State<'_, SharedNotesWorkspace>,
    revision: u64,
    directory: String,
    name: String,
) -> crate::error::AppResult<String> {
    workspace.create(revision, &directory, &name)
}

#[tauri::command]
pub fn get_settings(
    store: State<'_, crate::settings::SharedSettingsStore>,
) -> AppResult<crate::settings::SettingsSnapshot> {
    Ok(store.snapshot())
}

#[tauri::command]
pub fn update_settings(
    store: State<'_, crate::settings::SharedSettingsStore>,
    expected_revision: u64,
    settings: crate::settings::Settings,
) -> AppResult<crate::settings::SettingsSnapshot> {
    store.replace(expected_revision, settings)
}

#[tauri::command]
pub fn activate_provider(
    store: State<'_, crate::settings::SharedSettingsStore>,
    expected_revision: u64,
    capability: crate::providers::Capability,
    provider_id: crate::providers::ProviderId,
) -> AppResult<crate::settings::SettingsSnapshot> {
    store.activate_provider(expected_revision, capability, provider_id)
}

#[tauri::command]
pub fn deactivate_provider(
    store: State<'_, crate::settings::SharedSettingsStore>,
    expected_revision: u64,
    capability: crate::providers::Capability,
) -> AppResult<crate::settings::SettingsSnapshot> {
    store.deactivate_provider(expected_revision, capability)
}

#[tauri::command]
pub fn get_server_status(
    server: State<'_, crate::http_server::SharedLocalHttpServer>,
) -> AppResult<crate::http_server::ServerStatus> {
    Ok(server.status())
}

#[tauri::command]
pub async fn delete_note_folder(
    workspace: State<'_, SharedNotesWorkspace>,
    revision: u64,
    relative_path: String,
) -> crate::error::AppResult<()> {
    workspace.delete_folder(revision, &relative_path)
}

#[tauri::command]
pub fn get_system_info(
    paths: State<'_, crate::settings::RuntimePaths>,
) -> AppResult<crate::settings::SystemInfo> {
    Ok(paths.system_info())
}
