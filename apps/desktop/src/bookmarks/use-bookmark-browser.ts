import { useCallback, useEffect, useMemo, useState } from 'react';
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { Bookmark, BookmarkBaseView, BookmarkPageRequest } from '@/types';
import { useTauriEvent } from '@/lib/use-tauri-event';
import {
  BkQueryApiKey,
  bookmarkQueryKey,
  getNextBookmarkPageParam,
  invalidateNonRandomBookmarkQueries,
  queryBookmarksApi,
  setBookmarkStarredApi,
  updateBookmarkAccessQueries,
  updateRandomBookmarkQuery,
} from './bookmarks.api';

const PAGE_SIZE = 50;
const RANDOM_LIMIT = 7;
const RANDOM_ANIMATION_MS = 700;

export function useBookmarkBrowser() {
  const queryClient = useQueryClient();
  const [query, setQuery] = useState('');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [baseView, setBaseView] = useState<BookmarkBaseView>('all');
  const [randomDrawId, setRandomDrawId] = useState(() => Date.now());
  const [randomDrawing, setRandomDrawing] = useState(false);
  const isSearchMode = query.length > 0 || selectedTags.length > 0;
  const starredView = !isSearchMode && baseView === 'starred';
  const randomView = !isSearchMode && baseView === 'random';
  const bookmarkRequest = useMemo<BookmarkPageRequest>(() => {
    if (isSearchMode)
      return { mode: 'search', query, tags: selectedTags, cursor: null, page_size: PAGE_SIZE };
    if (randomView) return { mode: 'random', limit: RANDOM_LIMIT };
    return { mode: 'browse', starred: starredView, cursor: null, page_size: PAGE_SIZE };
  }, [isSearchMode, query, randomView, selectedTags, starredView]);
  const bookmarksQuery = useInfiniteQuery({
    queryKey: bookmarkQueryKey(bookmarkRequest, randomDrawId),
    initialPageParam: null as string | null,
    queryFn: async ({ pageParam }) => {
      const request =
        bookmarkRequest.mode === 'random'
          ? bookmarkRequest
          : { ...bookmarkRequest, cursor: pageParam };
      const response = queryBookmarksApi(request);
      if (bookmarkRequest.mode !== 'random') return response;
      const [page] = await Promise.all([
        response,
        new Promise<void>((resolve) => window.setTimeout(resolve, RANDOM_ANIMATION_MS)),
      ]);
      return page;
    },
    getNextPageParam: getNextBookmarkPageParam,
    placeholderData: randomView
      ? (previousData, previousQuery) =>
          (previousQuery?.queryKey[1] as BookmarkPageRequest | undefined)?.mode === 'random'
            ? previousData
            : undefined
      : undefined,
    refetchOnWindowFocus: !randomView,
  });
  const bookmarks = useMemo(
    () => bookmarksQuery.data?.pages.flatMap((page) => page.items) ?? [],
    [bookmarksQuery.data],
  );
  const starMutation = useMutation({
    mutationFn: setBookmarkStarredApi,
    onSuccess: (updated) => {
      updateRandomBookmarkQuery(queryClient, updated);
      void invalidateNonRandomBookmarkQueries(queryClient);
    },
  });
  const startRandomDraw = useCallback(() => {
    if (randomDrawing) return false;
    setRandomDrawing(true);
    setRandomDrawId((current) => current + 1);
    return true;
  }, [randomDrawing]);
  const handleSearch = useCallback(
    (value: string) => {
      const nextQuery = value.trim();
      if (baseView === 'random' && isSearchMode && !nextQuery && selectedTags.length === 0)
        startRandomDraw();
      setQuery(nextQuery);
    },
    [baseView, isSearchMode, selectedTags.length, startRandomDraw],
  );
  const handleTagsChange = useCallback(
    (tags: string[]) => {
      if (baseView === 'random' && isSearchMode && query.length === 0 && tags.length === 0)
        startRandomDraw();
      setSelectedTags(tags);
    },
    [baseView, isSearchMode, query.length, startRandomDraw],
  );
  const handleBaseViewChange = useCallback(
    (view: BookmarkBaseView) => {
      if (view === 'random' && !startRandomDraw()) return;
      if (view !== 'random') setRandomDrawing(false);
      setBaseView(view);
    },
    [startRandomDraw],
  );
  useEffect(() => {
    if (!randomView || !bookmarksQuery.isFetching) setRandomDrawing(false);
  }, [bookmarksQuery.isFetching, randomView]);
  useTauriEvent('bookmarks-changed', () => {
    void invalidateNonRandomBookmarkQueries(queryClient);
    void queryClient.invalidateQueries({ queryKey: [BkQueryApiKey.TAGS] });
  });
  useTauriEvent<Bookmark>('bookmark-accessed', ({ payload }) =>
    updateBookmarkAccessQueries(queryClient, payload),
  );
  return {
    bookmarks,
    bookmarksQuery,
    starMutation,
    selectedTags,
    baseView,
    randomDrawing,
    isSearchMode,
    starredView,
    randomView,
    handleSearch,
    handleTagsChange,
    handleBaseViewChange,
  };
}
