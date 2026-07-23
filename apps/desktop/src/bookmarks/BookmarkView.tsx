import { useState, useCallback, useMemo, useEffect } from 'react';
import SearchBar from './SearchBar';
import TagPanel from './TagPanel';
import ResultList from './ResultList';
import AddBookmarkDialog from './AddBookmarkDialog';
import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';
import { BkQueryApiKey, searchAllBookmarksApi, searchBookmarksApi } from './bookmarks.api';
import { useQuery } from '@tanstack/react-query';
import { listen } from '@tauri-apps/api/event';

const INITIAL_LOAD = 50;
const LOAD_MORE = 50;

export default function BookmarkView() {
  const { data: allBookmarks, isLoading: loadAllBkLoading, error: loadAllBkError, refetch: refetchAllBookmarks } = useQuery({
    queryKey: [BkQueryApiKey.ALL_BOOKMARKS],
    queryFn: searchAllBookmarksApi
  });


  const [query, setQuery] = useState('');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);

  const { data: searchResults, isPending: searching } = useQuery({
    queryKey: [BkQueryApiKey.SEARCH, query, selectedTags],
    queryFn: () => searchBookmarksApi({ query, tags: selectedTags }),
    enabled: query.trim() !== '' || selectedTags.length > 0,
});

  const [displayCount, setDisplayCount] = useState(INITIAL_LOAD);

  const [showAddDialog, setShowAddDialog] = useState(false);

  const handleSearch = useCallback((q: string) => {
    const queryStr = q.trim();
    setQuery(queryStr);
    setDisplayCount(INITIAL_LOAD);
  }, []);

  const handleTagsChange = useCallback((tags: string[]) => {
    setSelectedTags(tags);
    setDisplayCount(INITIAL_LOAD);
  }, []);

  // Display: backend-filtered results when available, otherwise all bookmarks
  const filteredBookmarks = useMemo(() => {
    return searchResults ?? allBookmarks ?? [];
  }, [allBookmarks, searchResults]);

  const visibleBookmarks = useMemo(
    () => filteredBookmarks.slice(0, displayCount),
    [filteredBookmarks, displayCount],
  );

  const hasMore = displayCount < filteredBookmarks.length;

  const handleLoadMore = useCallback(() => {
    setDisplayCount((prev) => Math.min(prev + LOAD_MORE, filteredBookmarks.length));
  }, [filteredBookmarks.length]);

  useEffect(() => {
    const unlisten = listen('bookmarks-changed', () => refetchAllBookmarks());
    return () => {
      unlisten.then((fn) => fn());
    };
  }, [refetchAllBookmarks]);

  return (
    <>
      <div className="shrink-0 px-4 py-3 border-b border-border">
        <div className="flex items-center gap-2">
          <SearchBar onSearch={handleSearch} loading={loadAllBkLoading || searching} />
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
          <TagPanel
            selectedTags={selectedTags}
            onTagsChange={handleTagsChange}
          />
        </aside>
        <main className="flex-1 flex flex-col overflow-hidden">
          <div className="flex-1 overflow-y-auto p-3 thin-scrollbar">
            <ResultList
              bookmarks={visibleBookmarks}
              loading={loadAllBkLoading || searching}
              error={loadAllBkError ? loadAllBkError.message : null}
              hasMore={hasMore}
              onLoadMore={handleLoadMore}
            />
          </div>
        </main>
      </div>

      <AddBookmarkDialog
        open={showAddDialog}
        onOpenChange={setShowAddDialog}
      />
    </>
  );
}
