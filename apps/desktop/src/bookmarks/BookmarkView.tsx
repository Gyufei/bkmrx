import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { open as openExternal } from '@tauri-apps/plugin-shell';
import { useHotkeys } from '@tanstack/react-hotkeys';

import { Button } from '@/components/ui/button';
import type { Bookmark, BookmarkBaseView } from '@/types';
import AddBookmarkDialog from './AddBookmarkDialog';
import {
  BkQueryApiKey,
  bookmarkQueryKey,
  getNextBookmarkPageParam,
  queryBookmarksApi,
  setBookmarkStarredApi,
} from './bookmarks.api';
import ResultList from './ResultList';
import SearchBar from './SearchBar';
import BookmarkSidebar from './BookmarkSidebar';
import BookmarkWebPreview from './BookmarkWebPreview';
import { invokeRecordBookmarkAccess } from '@/lib/invoke';
import { toast } from '@/components/ui/toast';
import { useTauriEvent } from '@/lib/use-tauri-event';
import CollapsibleSidebar from '@/components/CollapsibleSidebar';

const PAGE_SIZE = 50;

export default function BookmarkView() {
  const queryClient = useQueryClient();
  const [query, setQuery] = useState('');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [baseView, setBaseView] = useState<BookmarkBaseView>('all');
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [previewBookmark, setPreviewBookmark] = useState<Bookmark | null>(null);
  const [activeBookmarkId, setActiveBookmarkId] = useState<number | null>(null);
  const [resultListInteractionLocked, setResultListInteractionLocked] = useState(false);
  const [previewContainer, setPreviewContainer] = useState<HTMLDivElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const bookmarkElementsRef = useRef(new Map<number, HTMLElement>());
  const previewTriggerRef = useRef<HTMLElement | null>(null);
  const isSearchMode = query.length > 0 || selectedTags.length > 0;
  const starredView = !isSearchMode && baseView === 'starred';

  const bookmarksQuery = useInfiniteQuery({
    queryKey: bookmarkQueryKey(query, selectedTags, PAGE_SIZE, starredView),
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) =>
      queryBookmarksApi({
        query,
        tags: selectedTags,
        cursor: pageParam,
        page_size: PAGE_SIZE,
        starred_only: starredView,
      }),
    getNextPageParam: getNextBookmarkPageParam,
  });

  const bookmarks = useMemo(
    () => bookmarksQuery.data?.pages.flatMap((page) => page.items) ?? [],
    [bookmarksQuery.data],
  );
  const activeBookmarkIndex = bookmarks.findIndex((bookmark) => bookmark.id === activeBookmarkId);
  const activeBookmark = activeBookmarkIndex >= 0 ? bookmarks[activeBookmarkIndex] : null;
  const singleKeyLocked = showAddDialog || resultListInteractionLocked;
  const starMutation = useMutation({
    mutationFn: setBookmarkStarredApi,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [BkQueryApiKey.BOOKMARKS] });
    },
  });

  const handleSearch = useCallback((value: string) => {
    setQuery(value.trim());
  }, []);

  const handleTagsChange = useCallback((tags: string[]) => {
    setSelectedTags(tags);
  }, []);

  useEffect(() => {
    setActiveBookmarkId((currentId) => {
      if (bookmarks.length === 0) return null;
      return currentId !== null && bookmarks.some((bookmark) => bookmark.id === currentId)
        ? currentId
        : bookmarks[0].id;
    });
  }, [bookmarks]);

  useEffect(() => {
    if (activeBookmarkId === null) return;
    bookmarkElementsRef.current.get(activeBookmarkId)?.scrollIntoView?.({ block: 'nearest' });
  }, [activeBookmarkId]);

  useTauriEvent('bookmarks-changed', () => {
    queryClient.invalidateQueries({ queryKey: [BkQueryApiKey.BOOKMARKS] });
    queryClient.invalidateQueries({ queryKey: [BkQueryApiKey.TAGS] });
  });

  const recordAccess = useCallback(async (bookmark: Bookmark) => {
    try {
      await invokeRecordBookmarkAccess(bookmark.id);
    } catch {
      console.error('Failed to record bookmark access');
    }
  }, []);

  const handleOpenBookmark = useCallback(
    async (bookmark: Bookmark) => {
      try {
        await openExternal(bookmark.url);
        void recordAccess(bookmark);
      } catch {
        toast.add({
          type: 'error',
          title: '无法打开链接',
          description: bookmark.url,
        });
      }
    },
    [recordAccess],
  );

  const handlePreviewBookmark = useCallback(
    async (bookmark: Bookmark, trigger: HTMLElement) => {
      let protocol = '';
      try {
        protocol = new URL(bookmark.url).protocol;
      } catch {
        protocol = '';
      }

      if (protocol === 'http:' || protocol === 'https:') {
        previewTriggerRef.current = trigger;
        setPreviewBookmark(bookmark);
        void recordAccess(bookmark);
        return;
      }

      await handleOpenBookmark(bookmark);
    },
    [handleOpenBookmark, recordAccess],
  );

  const handlePreviewOpenChange = useCallback((open: boolean) => {
    if (open) return;
    setPreviewBookmark(null);
    if (previewTriggerRef.current?.isConnected) previewTriggerRef.current.focus();
    previewTriggerRef.current = null;
  }, []);

  const registerBookmarkElement = useCallback((id: number, element: HTMLElement | null) => {
    if (element) bookmarkElementsRef.current.set(id, element);
    else bookmarkElementsRef.current.delete(id);
  }, []);

  const moveActiveBookmark = useCallback(
    (offset: -1 | 1) => {
      if (bookmarks.length === 0) return;
      const currentIndex = Math.max(activeBookmarkIndex, 0);
      const nextIndex = Math.min(Math.max(currentIndex + offset, 0), bookmarks.length - 1);
      setActiveBookmarkId(bookmarks[nextIndex].id);
    },
    [activeBookmarkIndex, bookmarks],
  );

  useHotkeys([
    {
      hotkey: '/',
      callback: () => {
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
      },
      options: {
        enabled: !singleKeyLocked && previewBookmark === null,
        ignoreInputs: true,
        meta: { name: '搜索书签', description: '聚焦书签搜索框' },
      },
    },
    {
      hotkey: 'J',
      callback: () => moveActiveBookmark(1),
      options: {
        enabled: !singleKeyLocked && previewBookmark === null && bookmarks.length > 0,
        ignoreInputs: true,
        meta: { name: '下一条书签', description: '高亮下一条书签' },
      },
    },
    {
      hotkey: 'K',
      callback: () => moveActiveBookmark(-1),
      options: {
        enabled: !singleKeyLocked && previewBookmark === null && bookmarks.length > 0,
        ignoreInputs: true,
        meta: { name: '上一条书签', description: '高亮上一条书签' },
      },
    },
    {
      hotkey: 'P',
      callback: () => {
        if (!activeBookmark) return;
        const trigger = bookmarkElementsRef.current.get(activeBookmark.id);
        if (trigger) void handlePreviewBookmark(activeBookmark, trigger);
      },
      options: {
        enabled: !singleKeyLocked && previewBookmark === null && activeBookmark !== null,
        ignoreInputs: true,
        requireReset: true,
        meta: { name: '预览书签', description: '预览当前书签' },
      },
    },
    {
      hotkey: 'X',
      callback: () => handlePreviewOpenChange(false),
      options: {
        enabled: previewBookmark !== null,
        ignoreInputs: true,
        requireReset: true,
        meta: { name: '关闭预览', description: '关闭当前书签预览' },
      },
    },
    {
      hotkey: 'O',
      callback: () => {
        if (activeBookmark) void handleOpenBookmark(activeBookmark);
      },
      options: {
        enabled: !singleKeyLocked && previewBookmark === null && activeBookmark !== null,
        ignoreInputs: true,
        requireReset: true,
        meta: { name: '打开书签', description: '在浏览器打开当前书签' },
      },
    },
  ]);

  return (
    <div ref={setPreviewContainer} className="relative flex min-h-0 w-full flex-1 overflow-hidden">
      <CollapsibleSidebar title="标签" className="w-56" contentClassName="px-3 pb-3">
        <BookmarkSidebar
          selectedTags={selectedTags}
          onTagsChange={handleTagsChange}
          baseView={baseView}
          onBaseViewChange={setBaseView}
        />
      </CollapsibleSidebar>
      <main className="flex min-w-0 flex-1 flex-col overflow-hidden bg-background">
        <header className="shrink-0 border-b border-border px-4 py-3">
          <div className="flex items-center gap-2">
            <SearchBar
              ref={searchInputRef}
              onSearch={handleSearch}
              loading={bookmarksQuery.isLoading}
            />
            <Button
              variant="outline"
              className="flex size-10 shrink-0 items-center justify-center !px-0"
              onClick={() => setShowAddDialog(true)}
              title="添加书签"
            >
              <Plus />
            </Button>
          </div>
        </header>
        {starMutation.isError && (
          <div
            role="alert"
            className="shrink-0 border-b border-border px-4 py-2 text-sm text-destructive"
          >
            更新星标失败：{starMutation.error.message}
          </div>
        )}
        <div className="thin-scrollbar flex-1 overflow-y-auto p-3">
          <ResultList
            bookmarks={bookmarks}
            initialLoading={bookmarksQuery.isLoading}
            initialError={
              bookmarksQuery.isError && !bookmarksQuery.data ? bookmarksQuery.error.message : null
            }
            hasMore={bookmarksQuery.hasNextPage}
            isFetchingNextPage={bookmarksQuery.isFetchingNextPage}
            nextPageError={
              bookmarksQuery.isFetchNextPageError ? bookmarksQuery.error.message : null
            }
            onLoadMore={() => bookmarksQuery.fetchNextPage()}
            onRetryNextPage={() => bookmarksQuery.fetchNextPage()}
            starredView={starredView}
            emptyMessage={
              starredView
                ? '暂无星标书签。在搜索结果中点击星形按钮，即可将常用书签显示在这里。'
                : isSearchMode
                  ? '暂无匹配的书签'
                  : '暂无书签'
            }
            starPendingId={starMutation.isPending ? (starMutation.variables?.id ?? null) : null}
            onToggleStarred={(bookmark, starred) =>
              starMutation.mutate({ id: bookmark.id, starred })
            }
            onPreviewBookmark={handlePreviewBookmark}
            onOpenBookmark={handleOpenBookmark}
            activeBookmarkId={activeBookmarkId}
            onActiveBookmarkChange={setActiveBookmarkId}
            onBookmarkElementChange={registerBookmarkElement}
            onInteractionLockChange={setResultListInteractionLocked}
          />
        </div>
      </main>

      <AddBookmarkDialog open={showAddDialog} onOpenChange={setShowAddDialog} />
      <BookmarkWebPreview
        bookmark={previewBookmark}
        open={previewBookmark !== null}
        onOpenChange={handlePreviewOpenChange}
        container={previewContainer}
      />
    </div>
  );
}
