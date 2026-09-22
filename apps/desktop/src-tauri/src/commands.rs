use tauri::State;

use crate::bookmarks::{
    Bookmark, BookmarkInitializationResult, BookmarkInitializationStatus, BookmarkPage,
    BookmarkPageRequest, CreateBookmark, SharedBookmarkStore, TagQueryRequest, TagSummary,
    UpdateBookmark,
};
use crate::calendar::{
    CalendarDay, CalendarEvent, CalendarRangeRequest, CalendarService, CreateCalendarEvent,
    SharedCalendarEventStore, SharedCalendarService, UpdateCalendarEvent,
};
use crate::error::AppResult;
use crate::identity::BookmarkId;
use crate::navigation::{
    AddNavigationBookmarks, CreateNavigationCategory, NavigationCategory, NavigationPlacementCard,
    NavigationSection, ReorderNavigationCategories, SharedNavigationStore,
    UpdateNavigationCategory,
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

#[specta::specta]
#[tauri::command]
pub async fn get_calendar_days(
    service: State<'_, SharedCalendarService>,
    request: CalendarRangeRequest,
) -> AppResult<Vec<CalendarDay>> {
    query_calendar_days(&service, request).await
}

async fn query_calendar_days(
    service: &CalendarService,
    request: CalendarRangeRequest,
) -> AppResult<Vec<CalendarDay>> {
    service.query(request).await
}

#[specta::specta]
#[tauri::command]
pub fn list_calendar_events(
    service: State<'_, SharedCalendarEventStore>,
    start_date: String,
    end_date: String,
) -> AppResult<Vec<CalendarEvent>> {
    service.list(&start_date, &end_date)
}

#[specta::specta]
#[tauri::command]
pub fn create_calendar_event(
    service: State<'_, SharedCalendarEventStore>,
    input: CreateCalendarEvent,
) -> AppResult<CalendarEvent> {
    service.create(input)
}

#[specta::specta]
#[tauri::command]
pub fn update_calendar_event(
    service: State<'_, SharedCalendarEventStore>,
    id: crate::identity::CalendarEventId,
    input: UpdateCalendarEvent,
) -> AppResult<CalendarEvent> {
    service.update(id, input)
}

#[specta::specta]
#[tauri::command]
pub fn delete_calendar_event(
    service: State<'_, SharedCalendarEventStore>,
    id: crate::identity::CalendarEventId,
) -> AppResult<()> {
    service.delete(id)
}

#[specta::specta]
#[tauri::command]
pub fn list_navigation_sections(
    service: State<'_, SharedNavigationStore>,
) -> AppResult<Vec<NavigationSection>> {
    service.list_sections()
}

#[specta::specta]
#[tauri::command]
pub fn create_navigation_category(
    service: State<'_, SharedNavigationStore>,
    input: CreateNavigationCategory,
) -> AppResult<NavigationCategory> {
    service.create_category(input)
}

#[specta::specta]
#[tauri::command]
pub fn update_navigation_category(
    service: State<'_, SharedNavigationStore>,
    id: crate::identity::NavigationCategoryId,
    input: UpdateNavigationCategory,
) -> AppResult<NavigationCategory> {
    service.update_category(id, input)
}

#[specta::specta]
#[tauri::command]
pub fn delete_navigation_category(
    service: State<'_, SharedNavigationStore>,
    id: crate::identity::NavigationCategoryId,
) -> AppResult<()> {
    service.delete_category(id)
}

#[specta::specta]
#[tauri::command]
pub fn reorder_navigation_categories(
    service: State<'_, SharedNavigationStore>,
    input: ReorderNavigationCategories,
) -> AppResult<()> {
    service.reorder_categories(input)
}

#[specta::specta]
#[tauri::command]
pub fn add_navigation_bookmarks(
    service: State<'_, SharedNavigationStore>,
    category_id: crate::identity::NavigationCategoryId,
    input: AddNavigationBookmarks,
) -> AppResult<Vec<NavigationPlacementCard>> {
    service.add_bookmarks(category_id, input)
}

#[specta::specta]
#[tauri::command]
pub fn remove_navigation_bookmark(
    service: State<'_, SharedNavigationStore>,
    category_id: crate::identity::NavigationCategoryId,
    bookmark_id: BookmarkId,
) -> AppResult<()> {
    service.remove_bookmark(category_id, bookmark_id)
}

#[specta::specta]
#[tauri::command]
pub fn query_bookmarks(
    service: State<'_, SharedBookmarkStore>,
    request: BookmarkPageRequest,
) -> AppResult<BookmarkPage> {
    service.query(request)
}

#[specta::specta]
#[tauri::command]
pub fn create_bookmark(
    service: State<'_, SharedBookmarkStore>,
    input: CreateBookmark,
) -> AppResult<Bookmark> {
    service.create(input)
}

#[specta::specta]
#[tauri::command]
pub fn update_bookmark(
    service: State<'_, SharedBookmarkStore>,
    id: BookmarkId,
    input: UpdateBookmark,
) -> AppResult<Bookmark> {
    service.update(id, input)
}

#[specta::specta]
#[tauri::command]
pub fn delete_bookmarks(
    service: State<'_, SharedBookmarkStore>,
    ids: Vec<BookmarkId>,
) -> AppResult<u64> {
    service.delete_many(&ids)
}

#[specta::specta]
#[tauri::command]
pub fn get_bookmark_by_url(
    service: State<'_, SharedBookmarkStore>,
    url: String,
) -> AppResult<Option<Bookmark>> {
    service.find_by_url(&url)
}

#[specta::specta]
#[tauri::command]
pub fn get_tags(
    service: State<'_, SharedBookmarkStore>,
    request: TagQueryRequest,
) -> AppResult<Vec<TagSummary>> {
    service.tags(request)
}

#[specta::specta]
#[tauri::command]
pub fn record_bookmark_access(
    service: State<'_, SharedBookmarkStore>,
    id: BookmarkId,
) -> AppResult<Bookmark> {
    service.record_access(id)
}

#[specta::specta]
#[tauri::command]
pub fn set_bookmark_starred(
    service: State<'_, SharedBookmarkStore>,
    id: BookmarkId,
    starred: bool,
) -> AppResult<Bookmark> {
    service.set_starred(id, starred)
}

#[specta::specta]
#[tauri::command]
pub async fn prepare_bookmark_preview(
    service: State<'_, SharedPreviewService>,
    request: PrepareBookmarkPreviewRequest,
    force_refresh: bool,
) -> AppResult<BookmarkPreview> {
    Ok(service.prepare(request, force_refresh).await)
}

#[specta::specta]
#[tauri::command]
pub async fn preview_rss_feed(
    service: State<'_, SharedRssService>,
    url: String,
) -> AppResult<FeedPreview> {
    service.preview(&url).await
}

#[specta::specta]
#[tauri::command]
pub async fn create_rss_feed(
    service: State<'_, SharedRssService>,
    input: CreateFeed,
) -> AppResult<RssFeed> {
    service.create(input).await
}

#[specta::specta]
#[tauri::command]
pub fn list_rss_feeds(service: State<'_, SharedRssService>) -> AppResult<Vec<RssFeed>> {
    service.list_feeds()
}

#[specta::specta]
#[tauri::command]
pub fn list_rss_entries(
    service: State<'_, SharedRssService>,
    request: EntryPageRequest,
) -> AppResult<EntryPage> {
    service.list_entries(&request)
}

#[specta::specta]
#[tauri::command]
pub async fn refresh_rss_feed(
    service: State<'_, SharedRssService>,
    id: crate::identity::RssFeedId,
) -> AppResult<FeedRefreshResult> {
    service.refresh_feed(id).await
}

#[specta::specta]
#[tauri::command]
pub async fn refresh_all_rss_feeds(
    service: State<'_, SharedRssService>,
    stale_only: bool,
) -> AppResult<RefreshResult> {
    service.refresh_all(stale_only).await
}

#[specta::specta]
#[tauri::command]
pub fn mark_rss_entry_read(
    service: State<'_, SharedRssService>,
    id: crate::identity::RssEntryId,
    is_read: bool,
) -> AppResult<RssEntry> {
    service.mark_entry_read(id, is_read)
}

#[specta::specta]
#[tauri::command]
pub fn rename_rss_feed(
    service: State<'_, SharedRssService>,
    id: crate::identity::RssFeedId,
    custom_title: Option<String>,
) -> AppResult<RssFeed> {
    service.rename_feed(id, custom_title.as_deref())
}

#[specta::specta]
#[tauri::command]
pub fn delete_rss_feed(
    service: State<'_, SharedRssService>,
    id: crate::identity::RssFeedId,
) -> AppResult<()> {
    service.delete_feed(id)
}

#[specta::specta]
#[tauri::command]
pub async fn download_rss_image(
    url: String,
    referer: Option<String>,
    destination: String,
) -> AppResult<()> {
    crate::rss::download_image(&url, referer.as_deref(), std::path::Path::new(&destination)).await
}

#[specta::specta]
#[tauri::command]
pub fn query_todos(service: State<'_, SharedTodoStore>, request: TodoQuery) -> AppResult<TodoList> {
    service.query(request)
}

#[specta::specta]
#[tauri::command]
pub fn get_todo_tags(service: State<'_, SharedTodoStore>) -> AppResult<Vec<TodoTag>> {
    service.tags()
}

#[specta::specta]
#[tauri::command]
pub fn create_todo(service: State<'_, SharedTodoStore>, input: CreateTodo) -> AppResult<Todo> {
    service.create(input)
}

#[specta::specta]
#[tauri::command]
pub fn update_todo(
    service: State<'_, SharedTodoStore>,
    id: crate::identity::TodoId,
    input: UpdateTodo,
) -> AppResult<Todo> {
    service.update(id, input)
}

#[specta::specta]
#[tauri::command]
pub fn set_todo_status(
    service: State<'_, SharedTodoStore>,
    id: crate::identity::TodoId,
    status: TodoStatus,
) -> AppResult<Todo> {
    service.set_status(id, status)
}

#[specta::specta]
#[tauri::command]
pub fn delete_todo(
    service: State<'_, SharedTodoStore>,
    id: crate::identity::TodoId,
) -> AppResult<()> {
    service.delete(id)
}

#[specta::specta]
#[tauri::command]
pub fn rename_todo_tag(
    service: State<'_, SharedTodoStore>,
    id: crate::identity::TodoTagId,
    name: String,
) -> AppResult<TodoTag> {
    service.rename_tag(id, name)
}

#[specta::specta]
#[tauri::command]
pub fn delete_todo_tag(
    service: State<'_, SharedTodoStore>,
    id: crate::identity::TodoTagId,
) -> AppResult<()> {
    service.delete_tag(id)
}

#[specta::specta]
#[tauri::command]
pub fn archive_delete_todo_tag(
    service: State<'_, SharedTodoStore>,
    id: crate::identity::TodoTagId,
) -> AppResult<()> {
    service.archive_delete_tag(id)
}

#[specta::specta]
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

#[specta::specta]
#[tauri::command]
pub fn export_bookmark_dataset(
    service: State<'_, SharedBookmarkStore>,
    path: String,
) -> AppResult<String> {
    service
        .export(std::path::Path::new(&path))
        .map(|path| path.to_string_lossy().into_owned())
}

#[specta::specta]
#[tauri::command]
pub fn get_bookmark_initialization_status(
    service: State<'_, SharedBookmarkStore>,
) -> AppResult<BookmarkInitializationStatus> {
    service.initialization_status()
}

#[specta::specta]
#[tauri::command]
pub fn initialize_bookmarks(
    service: State<'_, SharedBookmarkStore>,
    path: String,
) -> AppResult<BookmarkInitializationResult> {
    service.initialize(std::path::Path::new(&path))
}

#[specta::specta]
#[tauri::command]
pub async fn scan_notes(
    workspace: State<'_, SharedNotesWorkspace>,
) -> crate::error::AppResult<crate::notes::NotesWorkspaceListing> {
    workspace.list()
}

#[specta::specta]
#[tauri::command]
pub async fn open_note_document(
    workspace: State<'_, SharedNotesWorkspace>,
    revision: u64,
    relative_path: String,
) -> crate::error::AppResult<crate::notes::OpenedDocument> {
    workspace.open_document(revision, &relative_path)
}

#[specta::specta]
#[tauri::command]
pub async fn open_html_document(
    workspace: State<'_, SharedNotesWorkspace>,
    revision: u64,
    relative_path: String,
) -> crate::error::AppResult<crate::notes::OpenedHtmlDocument> {
    workspace.open_html_document(revision, &relative_path)
}

#[specta::specta]
#[tauri::command]
pub async fn open_external_note_file(
    workspace: State<'_, SharedNotesWorkspace>,
    revision: u64,
    relative_path: String,
) -> crate::error::AppResult<()> {
    workspace.open_external_file(revision, &relative_path)
}

#[specta::specta]
#[tauri::command]
pub async fn save_note_document(
    workspace: State<'_, SharedNotesWorkspace>,
    receipt: String,
    content: String,
) -> crate::error::AppResult<crate::notes::SavedDocument> {
    workspace.save_document(&receipt, &content)
}

#[specta::specta]
#[tauri::command]
pub async fn rename_note_document(
    workspace: State<'_, SharedNotesWorkspace>,
    receipt: String,
    name: String,
    pending_content: Option<String>,
) -> crate::error::AppResult<crate::notes::RenamedDocument> {
    workspace.rename_document(&receipt, &name, pending_content.as_deref())
}

#[specta::specta]
#[tauri::command]
pub async fn delete_note_document(
    workspace: State<'_, SharedNotesWorkspace>,
    receipt: String,
) -> crate::error::AppResult<()> {
    workspace.delete_document(&receipt)
}

#[specta::specta]
#[tauri::command]
pub async fn rename_workspace_file(
    workspace: State<'_, SharedNotesWorkspace>,
    revision: u64,
    relative_path: String,
    name: String,
) -> crate::error::AppResult<String> {
    workspace.rename_file(revision, &relative_path, &name)
}

#[specta::specta]
#[tauri::command]
pub async fn delete_workspace_file(
    workspace: State<'_, SharedNotesWorkspace>,
    revision: u64,
    relative_path: String,
) -> crate::error::AppResult<()> {
    workspace.delete_file(revision, &relative_path)
}

#[specta::specta]
#[tauri::command]
pub async fn create_note_file(
    workspace: State<'_, SharedNotesWorkspace>,
    revision: u64,
    directory: String,
    name: String,
) -> crate::error::AppResult<String> {
    workspace.create(revision, &directory, &name)
}

#[specta::specta]
#[tauri::command]
pub fn get_settings(
    store: State<'_, crate::settings::SharedSettingsStore>,
) -> AppResult<crate::settings::SettingsSnapshot> {
    Ok(store.snapshot())
}

#[specta::specta]
#[tauri::command]
pub fn update_settings(
    store: State<'_, crate::settings::SharedSettingsStore>,
    expected_revision: u64,
    settings: crate::settings::Settings,
) -> AppResult<crate::settings::SettingsSnapshot> {
    store.replace(expected_revision, settings)
}

#[specta::specta]
#[tauri::command]
pub fn activate_provider(
    store: State<'_, crate::settings::SharedSettingsStore>,
    expected_revision: u64,
    capability: crate::providers::Capability,
    provider_id: crate::providers::ProviderId,
) -> AppResult<crate::settings::SettingsSnapshot> {
    store.activate_provider(expected_revision, capability, provider_id)
}

#[specta::specta]
#[tauri::command]
pub fn deactivate_provider(
    store: State<'_, crate::settings::SharedSettingsStore>,
    expected_revision: u64,
    capability: crate::providers::Capability,
) -> AppResult<crate::settings::SettingsSnapshot> {
    store.deactivate_provider(expected_revision, capability)
}

#[specta::specta]
#[tauri::command]
pub fn get_server_status(
    server: State<'_, crate::http_server::SharedLocalHttpServer>,
) -> AppResult<crate::http_server::ServerStatus> {
    Ok(server.status())
}

#[specta::specta]
#[tauri::command]
pub async fn delete_note_folder(
    workspace: State<'_, SharedNotesWorkspace>,
    receipt: String,
) -> crate::error::AppResult<()> {
    workspace.delete_folder(&receipt)
}

#[specta::specta]
#[tauri::command]
pub async fn preflight_note_folder_deletion(
    workspace: State<'_, SharedNotesWorkspace>,
    revision: u64,
    relative_path: String,
) -> crate::error::AppResult<crate::notes::FolderDeletionSummary> {
    workspace.preflight_folder_deletion(revision, &relative_path)
}

#[specta::specta]
#[tauri::command]
pub fn get_system_info(
    paths: State<'_, crate::settings::RuntimePaths>,
) -> AppResult<crate::settings::SystemInfo> {
    Ok(paths.system_info())
}

#[cfg(test)]
mod calendar_command_tests {
    use std::sync::{
        atomic::{AtomicUsize, Ordering},
        Arc,
    };

    use super::query_calendar_days;
    use crate::calendar::{
        CalendarContribution, CalendarHolidayDayType, CalendarRange, CalendarRangeRequest,
        CalendarService, CalendarSource, CalendarSourceRequirement, HolidayAnnotation,
        SourceFuture,
    };

    struct CommandSource {
        calls: Arc<AtomicUsize>,
    }

    impl CalendarSource for CommandSource {
        fn id(&self) -> &str {
            "command-test"
        }

        fn requirement(&self) -> CalendarSourceRequirement {
            CalendarSourceRequirement::Required
        }

        fn load<'a>(&'a self, _range: CalendarRange) -> SourceFuture<'a> {
            self.calls.fetch_add(1, Ordering::SeqCst);
            Box::pin(async {
                Ok(vec![CalendarContribution::Holiday {
                    date: "2026-10-01".into(),
                    annotation: HolidayAnnotation {
                        name: "国庆节".into(),
                        display_name: "国庆节".into(),
                        day_type: CalendarHolidayDayType::DayOff,
                        source: "command-test".into(),
                    },
                }])
            })
        }
    }

    fn service(calls: Arc<AtomicUsize>) -> CalendarService {
        CalendarService::new(vec![Arc::new(CommandSource { calls })])
    }

    #[tokio::test]
    async fn calendar_command_returns_service_results() {
        let calls = Arc::new(AtomicUsize::new(0));

        let days = query_calendar_days(
            &service(calls.clone()),
            CalendarRangeRequest {
                start_date: "2026-10-01".into(),
                end_date: "2026-10-01".into(),
            },
        )
        .await
        .unwrap();

        assert_eq!(days[0].holidays[0].display_name, "国庆节");
        assert_eq!(calls.load(Ordering::SeqCst), 1);
    }

    #[tokio::test]
    async fn calendar_command_rejects_invalid_input_before_loading_sources() {
        let calls = Arc::new(AtomicUsize::new(0));

        let error = query_calendar_days(
            &service(calls.clone()),
            CalendarRangeRequest {
                start_date: "invalid".into(),
                end_date: "2026-10-01".into(),
            },
        )
        .await
        .unwrap_err();

        assert_eq!(error.code(), "validation_error");
        assert_eq!(calls.load(Ordering::SeqCst), 0);
    }
}
