import {
  invokeCreateBookmark,
  invokeDeleteBookmarks,
  invokeGetBookmarkByUrl,
  invokeGetTags,
  invokeQueryBookmarks,
  invokeUpdateBookmark,
} from '../lib/invoke';
import type {
  BookmarkPage,
  BookmarkPageRequest,
  CreateBookmark,
  UpdateBookmark,
} from '../types';

export const BkQueryApiKey = {
  BOOKMARKS: 'bookmarks',
  TAGS: 'tags',
} as const;

export function bookmarkQueryKey(query: string, tags: string[], pageSize = 50) {
  return [BkQueryApiKey.BOOKMARKS, query, [...tags].sort(), pageSize] as const;
}

export function getNextBookmarkPageParam(lastPage: BookmarkPage) {
  return lastPage.next_cursor ?? undefined;
}

export function queryBookmarksApi(request: BookmarkPageRequest) {
  return invokeQueryBookmarks(request);
}

export function getAllTagsApi() {
  return invokeGetTags();
}

export function addBookmarkApi(input: CreateBookmark) {
  return invokeCreateBookmark(input);
}

export function deleteBookmarksApi(ids: number[]) {
  return invokeDeleteBookmarks(ids);
}

export function checkBookmarkApi(url: string) {
  return invokeGetBookmarkByUrl(url);
}

export function updateBookmarkApi({
  id,
  input,
}: {
  id: number;
  input: UpdateBookmark;
}) {
  return invokeUpdateBookmark(id, input);
}
