import { invoke } from '@tauri-apps/api/core';
import type {
  Bookmark,
  BookmarkPreview,
  BookmarkPage,
  BookmarkPageRequest,
  CreateBookmark,
  ImportPreview,
  PrepareBookmarkPreviewRequest,
  NoteFile,
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
} from '../types';

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

export function invokeUpdateBookmark(id: number, input: UpdateBookmark): Promise<Bookmark> {
  return invoke<Bookmark>('update_bookmark', { id, input });
}

export function invokeDeleteBookmarks(ids: number[]): Promise<number> {
  return invoke<number>('delete_bookmarks', { ids });
}

export function invokeGetBookmarkByUrl(url: string): Promise<Bookmark | null> {
  return invoke<Bookmark | null>('get_bookmark_by_url', { url });
}

export function invokeRecordBookmarkAccess(id: number): Promise<Bookmark> {
  return invoke<Bookmark>('record_bookmark_access', { id });
}

export function invokeSetBookmarkStarred(id: number, starred: boolean): Promise<Bookmark> {
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
export const invokeRefreshRssFeed = (id: number) =>
  invoke<FeedRefreshResult>('refresh_rss_feed', { id });
export const invokeRefreshAllRssFeeds = (staleOnly: boolean) =>
  invoke<RefreshResult>('refresh_all_rss_feeds', { staleOnly });
export const invokeMarkRssEntryRead = (id: number, isRead: boolean) =>
  invoke<RssEntry>('mark_rss_entry_read', { id, isRead });
export const invokeRenameRssFeed = (id: number, customTitle: string | null) =>
  invoke<RssFeed>('rename_rss_feed', { id, customTitle });
export const invokeDeleteRssFeed = (id: number) => invoke<void>('delete_rss_feed', { id });
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

export function invokeUpdateTodo(id: number, input: UpdateTodo): Promise<Todo> {
  return invoke<Todo>('update_todo', { id, input });
}

export function invokeSetTodoStatus(id: number, status: TodoStatus): Promise<Todo> {
  return invoke<Todo>('set_todo_status', { id, status });
}

export function invokeDeleteTodo(id: number): Promise<void> {
  return invoke('delete_todo', { id });
}

export function invokeRenameTodoTag(id: number, name: string): Promise<TodoTag> {
  return invoke<TodoTag>('rename_todo_tag', { id, name });
}

export function invokeDeleteTodoTag(id: number): Promise<void> {
  return invoke('delete_todo_tag', { id });
}

/* ───── Server ───── */

export function invokeGetServerStatus(): Promise<{ running: boolean; url: string }> {
  return invoke<{ running: boolean; url: string }>('get_server_status');
}

/* ───── Settings ───── */

export interface AppSettings {
  common: Record<string, never>;
  bookmark: { backup_dir: string | null };
  note: { notes_dir: string | null };
  rss: {
    rsshub_base_url: string | null;
    rsshub_access_key: string | null;
  };
}

export function invokeGetSettings(): Promise<AppSettings> {
  return invoke<AppSettings>('get_settings');
}

export function invokeUpdateSettings(settings: AppSettings): Promise<void> {
  return invoke('update_settings', { settings });
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

export function invokeScanNotes(dir: string): Promise<NoteFile[]> {
  return invoke<NoteFile[]>('scan_notes', { dir });
}

export function invokeReadNoteFile(path: string): Promise<string> {
  return invoke<string>('read_note_file', { path });
}

export function invokeWriteNoteFile(path: string, content: string): Promise<void> {
  return invoke('write_note_file', { path, content });
}

export function invokeCreateNoteFile(dir: string, name: string): Promise<string> {
  return invoke<string>('create_note_file', { dir, name });
}

export function invokeDeleteNote(path: string): Promise<void> {
  return invoke('delete_note', { path });
}

export function invokeRenameNote(oldPath: string, newPath: string): Promise<void> {
  return invoke('rename_note', { oldPath, newPath });
}
