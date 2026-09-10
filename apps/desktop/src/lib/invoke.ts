import { invoke } from '@tauri-apps/api/core';
import type {
  Bookmark,
  BookmarkPreview,
  BookmarkPage,
  BookmarkPageRequest,
  CreateBookmark,
  ImportPreview,
  PrepareBookmarkPreviewRequest,
  Tag,
  TagQueryRequest,
  UpdateBookmark,
  CreateTodo,
  Todo,
  TodoList,
  TodoQuery,
  TodoStatus,
  TodoTag,
  UpdateTodo,
  RssFeed,
  RssEntry,
  RssEntryPage,
  RssEntryScope,
  FeedPreview,
  FeedRefreshResult,
  RefreshResult,
  NavigationCategory,
  NavigationBookmark,
} from '../types';
import type {
  BookmarkId,
  NavigationCategoryId,
  RssEntryId,
  RssFeedId,
  TodoId,
  TodoTagId,
} from '../identity';

export const invokeListNavigationCategories = () =>
  invoke<NavigationCategory[]>('list_navigation_categories');
export const invokeCreateNavigationCategory = (name: string) =>
  invoke<NavigationCategory>('create_navigation_category', { input: { name } });
export const invokeUpdateNavigationCategory = (id: NavigationCategoryId, name: string) =>
  invoke<NavigationCategory>('update_navigation_category', { id, input: { name } });
export const invokeDeleteNavigationCategory = (id: NavigationCategoryId) =>
  invoke<void>('delete_navigation_category', { id });
export const invokeAddNavigationBookmarks = (
  categoryId: NavigationCategoryId,
  bookmarkIds: BookmarkId[],
) =>
  invoke<NavigationBookmark[]>('add_navigation_bookmarks', {
    categoryId,
    input: { bookmark_ids: bookmarkIds },
  });
export const invokeRemoveNavigationBookmark = (
  categoryId: NavigationCategoryId,
  bookmarkId: BookmarkId,
) => invoke<void>('remove_navigation_bookmark', { categoryId, bookmarkId });

/* ───── Bookmarks ───── */

export function invokeQueryBookmarks(request: BookmarkPageRequest): Promise<BookmarkPage> {
  return invoke<BookmarkPage>('query_bookmarks', { request });
}

export function invokeGetTags(request: TagQueryRequest): Promise<Tag[]> {
  return invoke<Tag[]>('get_tags', { request });
}

export function invokeCreateBookmark(input: CreateBookmark): Promise<Bookmark> {
  return invoke<Bookmark>('create_bookmark', { input });
}

export function invokeUpdateBookmark(id: BookmarkId, input: UpdateBookmark): Promise<Bookmark> {
  return invoke<Bookmark>('update_bookmark', { id, input });
}

export function invokeDeleteBookmarks(ids: BookmarkId[]): Promise<number> {
  return invoke<number>('delete_bookmarks', { ids });
}

export function invokeGetBookmarkByUrl(url: string): Promise<Bookmark | null> {
  return invoke<Bookmark | null>('get_bookmark_by_url', { url });
}

export function invokeRecordBookmarkAccess(id: BookmarkId): Promise<Bookmark> {
  return invoke<Bookmark>('record_bookmark_access', { id });
}

export function invokeSetBookmarkStarred(id: BookmarkId, starred: boolean): Promise<Bookmark> {
  return invoke<Bookmark>('set_bookmark_starred', { id, starred });
}

export function invokePrepareBookmarkPreview(
  request: PrepareBookmarkPreviewRequest,
  forceRefresh = false,
): Promise<BookmarkPreview> {
  return invoke<BookmarkPreview>('prepare_bookmark_preview', { request, forceRefresh });
}

/* ───── RSS ───── */

export const invokePreviewRssFeed = (url: string) =>
  invoke<FeedPreview>('preview_rss_feed', { url });
export const invokeCreateRssFeed = (input: {
  source_url: string;
  feed_url: string;
  custom_title: string | null;
}) => invoke<RssFeed>('create_rss_feed', { input });
export const invokeListRssFeeds = () => invoke<RssFeed[]>('list_rss_feeds');
export const invokeListRssEntries = (scope: RssEntryScope, cursor: string | null) =>
  invoke<RssEntryPage>('list_rss_entries', { request: { scope, cursor } });
export const invokeRefreshRssFeed = (id: RssFeedId) =>
  invoke<FeedRefreshResult>('refresh_rss_feed', { id });
export const invokeRefreshAllRssFeeds = (staleOnly: boolean) =>
  invoke<RefreshResult>('refresh_all_rss_feeds', { staleOnly });
export const invokeMarkRssEntryRead = (id: RssEntryId, isRead: boolean) =>
  invoke<RssEntry>('mark_rss_entry_read', { id, isRead });
export const invokeRenameRssFeed = (id: RssFeedId, customTitle: string | null) =>
  invoke<RssFeed>('rename_rss_feed', { id, customTitle });
export const invokeDeleteRssFeed = (id: RssFeedId) => invoke<void>('delete_rss_feed', { id });
export const invokeDownloadRssImage = (url: string, referer: string | null, destination: string) =>
  invoke<void>('download_rss_image', { url, referer, destination });

export function invokeExportBookmarks(path: string): Promise<string> {
  return invoke<string>('export_bookmarks', { path });
}

export function invokePreviewBookmarkImport(path: string): Promise<ImportPreview> {
  return invoke<ImportPreview>('preview_bookmark_import', { path });
}

export function invokeApplyBookmarkImport(path: string, fileHash: string): Promise<ImportPreview> {
  return invoke<ImportPreview>('apply_bookmark_import', { path, fileHash });
}

/* ───── Todos ───── */

export function invokeQueryTodos(request: TodoQuery): Promise<TodoList> {
  return invoke<TodoList>('query_todos', { request });
}

export function invokeGetTodoTags(): Promise<TodoTag[]> {
  return invoke<TodoTag[]>('get_todo_tags');
}

export function invokeCreateTodo(input: CreateTodo): Promise<Todo> {
  return invoke<Todo>('create_todo', { input });
}

export function invokeUpdateTodo(id: TodoId, input: UpdateTodo): Promise<Todo> {
  return invoke<Todo>('update_todo', { id, input });
}

export function invokeSetTodoStatus(id: TodoId, status: TodoStatus): Promise<Todo> {
  return invoke<Todo>('set_todo_status', { id, status });
}

export function invokeDeleteTodo(id: TodoId): Promise<void> {
  return invoke('delete_todo', { id });
}

export function invokeRenameTodoTag(id: TodoTagId, name: string): Promise<TodoTag> {
  return invoke<TodoTag>('rename_todo_tag', { id, name });
}

export function invokeDeleteTodoTag(id: TodoTagId): Promise<void> {
  return invoke('delete_todo_tag', { id });
}

export function invokeArchiveDeleteTodoTag(id: TodoTagId): Promise<void> {
  return invoke('archive_delete_todo_tag', { id });
}

export function invokeExportTodos(path: string, tagId: TodoTagId): Promise<string> {
  return invoke<string>('export_todos', { path, tagId });
}

/* ───── Server ───── */

export function invokeGetServerStatus(): Promise<{ running: boolean; url: string }> {
  return invoke<{ running: boolean; url: string }>('get_server_status');
}

/* ───── Settings ───── */

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

export function invokeGetSettings(): Promise<SettingsSnapshot> {
  return invoke<SettingsSnapshot>('get_settings');
}

export function invokeUpdateSettings(
  expectedRevision: number,
  settings: AppSettings,
): Promise<SettingsSnapshot> {
  return invoke<SettingsSnapshot>('update_settings', { expectedRevision, settings });
}

export function invokeActivateProvider(
  expectedRevision: number,
  capability: ProviderStatus['descriptor']['capability'],
  providerId: string,
): Promise<SettingsSnapshot> {
  return invoke<SettingsSnapshot>('activate_provider', {
    expectedRevision,
    capability,
    providerId,
  });
}

export function invokeDeactivateProvider(
  expectedRevision: number,
  capability: ProviderStatus['descriptor']['capability'],
): Promise<SettingsSnapshot> {
  return invoke<SettingsSnapshot>('deactivate_provider', { expectedRevision, capability });
}

/* ───── System ───── */

export interface SystemInfo {
  app_data_dir: string;
  sqlite_db_path: string;
  schema_version: number;
  search_backend: string;
  app_version: string;
}

export function invokeGetSystemInfo(): Promise<SystemInfo> {
  return invoke<SystemInfo>('get_system_info');
}

/* ───── Notes ───── */

export function invokeScanNotes(): Promise<import('../types').NotesWorkspaceListing> {
  return invoke('scan_notes');
}

export function invokeOpenNoteDocument(
  revision: number,
  relativePath: string,
): Promise<import('../types').OpenedNoteDocument> {
  return invoke('open_note_document', { revision, relativePath });
}

export function invokeSaveNoteDocument(
  receipt: string,
  content: string,
): Promise<import('../types').SavedNoteDocument> {
  return invoke('save_note_document', { receipt, content });
}

export function invokeRenameNoteDocument(
  receipt: string,
  name: string,
  pendingContent?: string,
): Promise<import('../types').RenamedNoteDocument> {
  return invoke('rename_note_document', { receipt, name, pendingContent });
}

export function invokeDeleteNoteDocument(receipt: string): Promise<void> {
  return invoke('delete_note_document', { receipt });
}

export function invokeCreateNoteFile(
  revision: number,
  directory: string,
  name: string,
): Promise<string> {
  return invoke<string>('create_note_file', { revision, directory, name });
}

export function invokeDeleteNoteFolder(revision: number, relativePath: string): Promise<void> {
  return invoke('delete_note_folder', { revision, relativePath });
}
