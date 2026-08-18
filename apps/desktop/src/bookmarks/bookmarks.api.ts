import {
  invokeCreateBookmark,
  invokeDeleteBookmarks,
  invokeGetBookmarkByUrl,
  invokeGetTags,
  invokeQueryBookmarks,
  invokeSetBookmarkStarred,
  invokeUpdateBookmark,
} from '../lib/invoke';
import type {
  Bookmark,
  BookmarkPage,
  BookmarkPageRequest,
  CreateBookmark,
  TagQueryRequest,
  UpdateBookmark,
} from '../types';
import type { InfiniteData, QueryClient } from '@tanstack/react-query';

export const BkQueryApiKey = {
  BOOKMARKS: 'bookmarks',
  TAGS: 'tags',
} as const;

export function bookmarkQueryKey(request: BookmarkPageRequest, drawId = 0) {
  const normalizedRequest =
    request.mode === 'search'
      ? { ...request, query: request.query.trim(), tags: [...request.tags].sort() }
      : request;
  return [
    BkQueryApiKey.BOOKMARKS,
    normalizedRequest,
    request.mode === 'random' ? drawId : 0,
  ] as const;
}

export function getNextBookmarkPageParam(lastPage: BookmarkPage) {
  return lastPage.next_cursor ?? undefined;
}

export function queryBookmarksApi(request: BookmarkPageRequest) {
  return invokeQueryBookmarks(request);
}

function isRandomBookmarkQuery(queryKey: readonly unknown[]) {
  return (
    queryKey[0] === BkQueryApiKey.BOOKMARKS &&
    (queryKey[1] as BookmarkPageRequest | undefined)?.mode === 'random'
  );
}

export function invalidateNonRandomBookmarkQueries(queryClient: QueryClient) {
  return queryClient.invalidateQueries({
    predicate: ({ queryKey }) =>
      queryKey[0] === BkQueryApiKey.BOOKMARKS && !isRandomBookmarkQuery(queryKey),
  });
}

export function updateRandomBookmarkQuery(queryClient: QueryClient, updated: Bookmark) {
  queryClient.setQueriesData<InfiniteData<BookmarkPage>>(
    { predicate: ({ queryKey }) => isRandomBookmarkQuery(queryKey) },
    (data) =>
      data
        ? {
            ...data,
            pages: data.pages.map((page) => ({
              ...page,
              items: page.items.map((bookmark) =>
                bookmark.id === updated.id ? updated : bookmark,
              ),
            })),
          }
        : data,
  );
}

export function updateBookmarkAccessQueries(queryClient: QueryClient, updated: Bookmark) {
  queryClient.setQueriesData<InfiniteData<BookmarkPage>>(
    { queryKey: [BkQueryApiKey.BOOKMARKS] },
    (data) =>
      data
        ? {
            ...data,
            pages: data.pages.map((page) => ({
              ...page,
              items: page.items.map((bookmark) =>
                bookmark.id === updated.id
                  ? {
                      ...bookmark,
                      access_count: updated.access_count,
                      accessed_at: updated.accessed_at,
                    }
                  : bookmark,
              ),
            })),
          }
        : data,
  );
}

export function removeRandomBookmarksFromQuery(queryClient: QueryClient, ids: number[]) {
  const deletedIds = new Set(ids);
  queryClient.setQueriesData<InfiniteData<BookmarkPage>>(
    { predicate: ({ queryKey }) => isRandomBookmarkQuery(queryKey) },
    (data) =>
      data
        ? {
            ...data,
            pages: data.pages.map((page) => ({
              ...page,
              items: page.items.filter((bookmark) => !deletedIds.has(bookmark.id)),
            })),
          }
        : data,
  );
}

export function tagQueryKey(query: string, limit: number | null) {
  return [BkQueryApiKey.TAGS, query.trim(), limit] as const;
}

export function getTagsApi(request: TagQueryRequest) {
  return invokeGetTags({ ...request, query: request.query.trim() });
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

export function updateBookmarkApi({ id, input }: { id: number; input: UpdateBookmark }) {
  return invokeUpdateBookmark(id, input);
}

export function setBookmarkStarredApi({ id, starred }: { id: number; starred: boolean }) {
  return invokeSetBookmarkStarred(id, starred);
}
