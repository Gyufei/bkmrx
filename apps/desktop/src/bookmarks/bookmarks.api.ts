import {
  invokeLoadAllBookmarks,
  invokeGetAllTags,
  invokeBackupBookmarks,
  invokeAddBookmark,
  invokeHybridSearchBookmarks,
  invokeDeleteBookmarks,
  invokeCheckBookmark,
  invokeUpdateBookmark,
} from '../lib/invoke';

export const BkQueryApiKey = {
  ALL_BOOKMARKS: 'allBookmarks',
  TAGS: 'tags',
  SEARCH: 'search',
  SYSTEM_INFO: 'systemInfo',
  SETTINGS: 'settings',
}

export async function searchAllBookmarksApi() {
  return await invokeLoadAllBookmarks();
}

export async function getAllTagsApi() {
  return await invokeGetAllTags();
}

export async function searchBookmarksApi({ query, tags }: { query: string, tags: string[] }) {
  return await invokeHybridSearchBookmarks(query, tags);
}

export async function addBookmarkApi({ url, title, tags, description }: { url: string, title: string, tags: string[], description?: string }) {
  return await invokeAddBookmark(url, title, tags, description);
}

export async function deleteBookmarksApi(ids: number[]) {
  return await invokeDeleteBookmarks(ids);
}

export async function checkBookmarkApi(url: string) {
  return await invokeCheckBookmark(url);
}

export async function updateBookmarkApi({ id, title, tags, description }: { id: number, title: string, tags: string[], description?: string }) {
  return await invokeUpdateBookmark(id, title, tags, description);
}

export async function backupBookmarksApi(dir: string) {
  return await invokeBackupBookmarks(dir);
}