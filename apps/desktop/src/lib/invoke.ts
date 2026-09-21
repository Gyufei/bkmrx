import { commands } from '../bindings';
import type { CalendarRangeRequest, CreateCalendarEvent, UpdateCalendarEvent } from '../calendar/calendar.types';
import type { CalendarDay, CalendarEvent } from '../calendar/calendar.types';
import type {
  BookmarkId, NavigationCategoryId,
  RssFeedId, RssEntryId,
  TodoId, TodoTagId,
} from '../identity';
import type {
  NavigationCategory, NavigationPlacementCard, NavigationSection,
  Bookmark, BookmarkPreview, BookmarkPage, BookmarkPageRequest,
  CreateBookmark, UpdateBookmark, Tag, TagQueryRequest,
  PrepareBookmarkPreviewRequest,
  BookmarkInitializationResult, BookmarkInitializationStatus,
  RssFeed, RssEntry, RssEntryPage, RssEntryScope,
  FeedPreview, FeedRefreshResult, RefreshResult,
  Todo, TodoList, TodoQuery, TodoStatus, TodoTag,
  CreateTodo, UpdateTodo,
  NotesWorkspaceListing, OpenedNoteDocument, SavedNoteDocument,
  RenamedNoteDocument, FolderDeletionSummary,
} from '../types';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function unwrap(result: Promise<{ status: 'ok'; data: any } | { status: 'error'; error: unknown }>): Promise<any> {
  const r = await result;
  if (r.status === 'error') throw r.error;
  return r.data;
}

/* ───── Types (re-exported for consumers) ───── */

export interface AppSettings {
  schema_version: number;
  common: {
    paths: {
      bookmark_export_dir: string | null;
      todo_export_dir: string | null;
      notes_dir: string | null;
    };
  };
  capabilities: {
    translation: {
      primary_provider: string | null;
      fallback_providers: string[];
    };
  };
  providers: {
    niutrans: {
      app_id: string | null;
      api_key: string | null;
    };
  };
  services: {
    rsshub: {
      base_url: string | null;
      access_key: string | null;
    };
  };
}

export interface ProviderStatus {
  descriptor: {
    id: string;
    capability: 'translation' | 'ai';
    display_name: string;
    description: string;
  };
  configured: boolean;
  activation: 'inactive' | 'primary' | { fallback: { position: number } };
}

export interface SettingsSnapshot {
  revision: number;
  settings: AppSettings;
  providers: ProviderStatus[];
}

export interface SystemInfo {
  app_data_dir: string;
  sqlite_db_path: string;
  schema_version: number;
  search_backend: string;
  app_version: string;
}

/* ───── Calendar ───── */

export function invokeGetCalendarDays(request: CalendarRangeRequest): Promise<CalendarDay[]> {
  return unwrap(commands.getCalendarDays(request as any));
}
export const invokeListCalendarEvents = (startDate: string, endDate: string): Promise<CalendarEvent[]> =>
  unwrap(commands.listCalendarEvents(startDate, endDate));
export const invokeCreateCalendarEvent = (input: CreateCalendarEvent): Promise<CalendarEvent> =>
  unwrap(commands.createCalendarEvent(input as any));
export const invokeUpdateCalendarEvent = (id: string, input: UpdateCalendarEvent): Promise<CalendarEvent> =>
  unwrap(commands.updateCalendarEvent(id, input as any));
export const invokeDeleteCalendarEvent = (id: string): Promise<void> =>
  unwrap(commands.deleteCalendarEvent(id));

/* ───── Navigation ───── */

export const invokeListNavigationSections = (): Promise<NavigationSection[]> =>
  unwrap(commands.listNavigationSections());
export const invokeCreateNavigationCategory = (name: string): Promise<NavigationCategory> =>
  unwrap(commands.createNavigationCategory({ name } as any));
export const invokeUpdateNavigationCategory = (id: NavigationCategoryId, name: string): Promise<NavigationCategory> =>
  unwrap(commands.updateNavigationCategory(id, { name } as any));
export const invokeDeleteNavigationCategory = (id: NavigationCategoryId): Promise<void> =>
  unwrap(commands.deleteNavigationCategory(id));
export const invokeReorderNavigationCategories = (categoryIds: NavigationCategoryId[]): Promise<void> =>
  unwrap(commands.reorderNavigationCategories({ category_ids: categoryIds } as any));
export const invokeAddNavigationBookmarks = (
  categoryId: NavigationCategoryId,
  bookmarkIds: BookmarkId[],
): Promise<NavigationPlacementCard[]> =>
  unwrap(commands.addNavigationBookmarks(categoryId, { bookmark_ids: bookmarkIds } as any));
export const invokeRemoveNavigationBookmark = (
  categoryId: NavigationCategoryId,
  bookmarkId: BookmarkId,
): Promise<void> =>
  unwrap(commands.removeNavigationBookmark(categoryId, bookmarkId));

/* ───── Bookmarks ───── */

export function invokeQueryBookmarks(request: BookmarkPageRequest): Promise<BookmarkPage> {
  return unwrap(commands.queryBookmarks(request as any));
}

export function invokeGetTags(request: TagQueryRequest): Promise<Tag[]> {
  return unwrap(commands.getTags(request as any));
}

export function invokeCreateBookmark(input: CreateBookmark): Promise<Bookmark> {
  return unwrap(commands.createBookmark(input as any));
}

export function invokeUpdateBookmark(id: BookmarkId, input: UpdateBookmark): Promise<Bookmark> {
  return unwrap(commands.updateBookmark(id, input as any));
}

export function invokeDeleteBookmarks(ids: BookmarkId[]): Promise<number> {
  return unwrap(commands.deleteBookmarks(ids));
}

export function invokeGetBookmarkByUrl(url: string): Promise<Bookmark | null> {
  return unwrap(commands.getBookmarkByUrl(url));
}

export function invokeRecordBookmarkAccess(id: BookmarkId): Promise<Bookmark> {
  return unwrap(commands.recordBookmarkAccess(id));
}

export function invokeSetBookmarkStarred(id: BookmarkId, starred: boolean): Promise<Bookmark> {
  return unwrap(commands.setBookmarkStarred(id, starred));
}

export function invokePrepareBookmarkPreview(
  request: PrepareBookmarkPreviewRequest,
  forceRefresh = false,
): Promise<BookmarkPreview> {
  return unwrap(commands.prepareBookmarkPreview(request as any, forceRefresh));
}

/* ───── RSS ───── */

export const invokePreviewRssFeed = (url: string): Promise<FeedPreview> =>
  unwrap(commands.previewRssFeed(url));
export const invokeCreateRssFeed = (input: {
  source_url: string;
  feed_url: string;
  custom_title: string | null;
}): Promise<RssFeed> =>
  unwrap(commands.createRssFeed(input as any));
export const invokeListRssFeeds = (): Promise<RssFeed[]> =>
  unwrap(commands.listRssFeeds());
export const invokeListRssEntries = (scope: RssEntryScope, cursor: string | null): Promise<RssEntryPage> =>
  unwrap(commands.listRssEntries({ scope, cursor } as any));
export const invokeRefreshRssFeed = (id: RssFeedId): Promise<FeedRefreshResult> =>
  unwrap(commands.refreshRssFeed(id));
export const invokeRefreshAllRssFeeds = (staleOnly: boolean): Promise<RefreshResult> =>
  unwrap(commands.refreshAllRssFeeds(staleOnly));
export const invokeMarkRssEntryRead = (id: RssEntryId, isRead: boolean): Promise<RssEntry> =>
  unwrap(commands.markRssEntryRead(id, isRead));
export const invokeRenameRssFeed = (id: RssFeedId, customTitle: string | null): Promise<RssFeed> =>
  unwrap(commands.renameRssFeed(id, customTitle));
export const invokeDeleteRssFeed = (id: RssFeedId): Promise<void> =>
  unwrap(commands.deleteRssFeed(id));
export const invokeDownloadRssImage = (url: string, referer: string | null, destination: string): Promise<void> =>
  unwrap(commands.downloadRssImage(url, referer, destination));

export function invokeExportBookmarkDataset(path: string): Promise<string> {
  return unwrap(commands.exportBookmarkDataset(path));
}

export function invokeGetBookmarkInitializationStatus(): Promise<BookmarkInitializationStatus> {
  return unwrap(commands.getBookmarkInitializationStatus());
}

export function invokeInitializeBookmarks(path: string): Promise<BookmarkInitializationResult> {
  return unwrap(commands.initializeBookmarks(path));
}

/* ───── Todos ───── */

export function invokeQueryTodos(request: TodoQuery): Promise<TodoList> {
  return unwrap(commands.queryTodos(request as any));
}

export function invokeGetTodoTags(): Promise<TodoTag[]> {
  return unwrap(commands.getTodoTags());
}

export function invokeCreateTodo(input: CreateTodo): Promise<Todo> {
  return unwrap(commands.createTodo(input as any));
}

export function invokeUpdateTodo(id: TodoId, input: UpdateTodo): Promise<Todo> {
  return unwrap(commands.updateTodo(id, input as any));
}

export function invokeSetTodoStatus(id: TodoId, status: TodoStatus): Promise<Todo> {
  return unwrap(commands.setTodoStatus(id, status as any));
}

export function invokeDeleteTodo(id: TodoId): Promise<void> {
  return unwrap(commands.deleteTodo(id));
}

export function invokeRenameTodoTag(id: TodoTagId, name: string): Promise<TodoTag> {
  return unwrap(commands.renameTodoTag(id, name));
}

export function invokeDeleteTodoTag(id: TodoTagId): Promise<void> {
  return unwrap(commands.deleteTodoTag(id));
}

export function invokeArchiveDeleteTodoTag(id: TodoTagId): Promise<void> {
  return unwrap(commands.archiveDeleteTodoTag(id));
}

export function invokeExportTodos(path: string, tagId: TodoTagId): Promise<string> {
  return unwrap(commands.exportTodos(path, tagId));
}

/* ───── Server ───── */

export function invokeGetServerStatus(): Promise<{ running: boolean; url: string }> {
  return unwrap(commands.getServerStatus());
}

/* ───── Settings ───── */

export function invokeGetSettings(): Promise<SettingsSnapshot> {
  return unwrap(commands.getSettings());
}

export function invokeUpdateSettings(
  expectedRevision: number,
  settings: AppSettings,
): Promise<SettingsSnapshot> {
  return unwrap(commands.updateSettings(expectedRevision, settings as any));
}

export function invokeActivateProvider(
  expectedRevision: number,
  capability: ProviderStatus['descriptor']['capability'],
  providerId: string,
): Promise<SettingsSnapshot> {
  return unwrap(commands.activateProvider(expectedRevision, capability as any, providerId));
}

export function invokeDeactivateProvider(
  expectedRevision: number,
  capability: ProviderStatus['descriptor']['capability'],
): Promise<SettingsSnapshot> {
  return unwrap(commands.deactivateProvider(expectedRevision, capability as any));
}

/* ───── System ───── */

export function invokeGetSystemInfo(): Promise<SystemInfo> {
  return unwrap(commands.getSystemInfo());
}

/* ───── Notes ───── */

export function invokeScanNotes(): Promise<NotesWorkspaceListing> {
  return unwrap(commands.scanNotes());
}

export function invokeOpenNoteDocument(
  revision: number,
  relativePath: string,
): Promise<OpenedNoteDocument> {
  return unwrap(commands.openNoteDocument(revision, relativePath));
}

export function invokeOpenExternalNoteFile(revision: number, relativePath: string): Promise<void> {
  return unwrap(commands.openExternalNoteFile(revision, relativePath));
}

export function invokeSaveNoteDocument(
  receipt: string,
  content: string,
): Promise<SavedNoteDocument> {
  return unwrap(commands.saveNoteDocument(receipt, content));
}

export function invokeRenameNoteDocument(
  receipt: string,
  name: string,
  pendingContent?: string,
): Promise<RenamedNoteDocument> {
  return unwrap(commands.renameNoteDocument(receipt, name, pendingContent ?? null));
}

export function invokeDeleteNoteDocument(receipt: string): Promise<void> {
  return unwrap(commands.deleteNoteDocument(receipt));
}

export function invokeCreateNoteFile(
  revision: number,
  directory: string,
  name: string,
): Promise<string> {
  return unwrap(commands.createNoteFile(revision, directory, name));
}

export function invokeDeleteNoteFolder(receipt: string): Promise<void> {
  return unwrap(commands.deleteNoteFolder(receipt));
}

export function invokePreflightNoteFolderDeletion(
  revision: number,
  relativePath: string,
): Promise<FolderDeletionSummary> {
  return unwrap(commands.preflightNoteFolderDeletion(revision, relativePath));
}
