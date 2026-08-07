import { useCallback, useEffect, useMemo, useState } from 'react';
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { listen } from '@tauri-apps/api/event';
import { Plus } from 'lucide-react';

import { Button } from '@/components/ui/button';
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
import TagPanel from './TagPanel';

const PAGE_SIZE = 50;

export default function BookmarkView() {
  const queryClient = useQueryClient();
  const [query, setQuery] = useState('');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const starredView = query.length === 0 && selectedTags.length === 0;

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
    const unlisten = listen('bookmarks-changed', () => {
      queryClient.invalidateQueries({ queryKey: [BkQueryApiKey.BOOKMARKS] });
      queryClient.invalidateQueries({ queryKey: [BkQueryApiKey.TAGS] });
    });
    return () => {
      unlisten.then((stop) => stop());
    };
  }, [queryClient]);

  return (
    <>
      <div className="shrink-0 px-4 py-3 border-b border-border">
        <div className="flex items-center gap-2">
          <SearchBar onSearch={handleSearch} loading={bookmarksQuery.isLoading} />
          <Button
            variant="outline"
            className="h-10 w-10 shrink-0 !px-0 flex items-center justify-center"
            onClick={() => setShowAddDialog(true)}
            title="添加书签"
          >
            <Plus className="h-5 w-5" />
          </Button>
        </div>
      </div>
      <div className="flex-1 flex overflow-hidden">
        <aside className="w-56 shrink-0 border-r border-border bg-sidebar p-3 flex flex-col">
          <TagPanel selectedTags={selectedTags} onTagsChange={handleTagsChange} />
        </aside>
        <main className="flex-1 flex flex-col overflow-hidden">
          {starMutation.isError && (
            <div
              role="alert"
              className="shrink-0 px-4 py-2 text-sm text-destructive border-b border-border"
            >
              更新星标失败：{starMutation.error.message}
            </div>
          )}
          <div className="flex-1 overflow-y-auto p-3 thin-scrollbar">
            <ResultList
              bookmarks={bookmarks}
              initialLoading={bookmarksQuery.isLoading}
              initialError={
                bookmarksQuery.isError && !bookmarksQuery.data
                  ? bookmarksQuery.error.message
                  : null
              }
              hasMore={bookmarksQuery.hasNextPage}
              isFetchingNextPage={bookmarksQuery.isFetchingNextPage}
              nextPageError={
                bookmarksQuery.isFetchNextPageError
                  ? bookmarksQuery.error.message
                  : null
              }
              onLoadMore={() => bookmarksQuery.fetchNextPage()}
              onRetryNextPage={() => bookmarksQuery.fetchNextPage()}
              starredView={starredView}
              emptyMessage={
                starredView
                  ? '暂无星标书签。在搜索结果中点击星形按钮，即可将常用书签显示在这里。'
                  : '暂无匹配的书签'
              }
              starPendingId={
                starMutation.isPending ? (starMutation.variables?.id ?? null) : null
              }
              onToggleStarred={(bookmark, starred) =>
                starMutation.mutate({ id: bookmark.id, starred })
              }
            />
          </div>
        </main>
      </div>

      <AddBookmarkDialog open={showAddDialog} onOpenChange={setShowAddDialog} />
    </>
  );
}
