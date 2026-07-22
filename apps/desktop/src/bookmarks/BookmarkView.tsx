import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import { listen } from "@tauri-apps/api/event";
import SearchBar from "./SearchBar";
import TagPanel from "./TagPanel";
import ResultList from "./ResultList";
import AddBookmarkDialog from "./AddBookmarkDialog";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { useBkmr } from "./useBkmr";
import type { Bookmark } from "../types";

const INITIAL_LOAD = 50;
const LOAD_MORE = 50;

export default function BookmarkView() {
  const {
    allBookmarks, loading, searching, error,
    loadAll, fetchTags, addBookmark, deleteBookmarks, updateBookmark, searchBookmarks,
  } = useBkmr();

  const [query, setQuery] = useState("");
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [displayCount, setDisplayCount] = useState(INITIAL_LOAD);
  const [searchResults, setSearchResults] = useState<Bookmark[] | null>(null);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [tagVersion, setTagVersion] = useState(0);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout>>();

  // Load on mount
  useEffect(() => { loadAll(); }, [loadAll]);

  // Reload when Chrome extension notifies
  useEffect(() => {
    const refresh = async () => {
      await loadAll();
      setTagVersion(v => v + 1);
    };
    const unlisten = listen("bookmarks-changed", refresh);
    return () => { unlisten.then(fn => fn()); };
  }, [loadAll]);

  // Search debounce — fires on query OR tag changes
  useEffect(() => {
    if (!query.trim() && selectedTags.length === 0) {
      setSearchResults(null);
      return;
    }
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(async () => {
      const results = await searchBookmarks(query.trim(), selectedTags);
      setSearchResults(results);
    }, 200);
    return () => { if (searchTimerRef.current) clearTimeout(searchTimerRef.current); };
  }, [query, selectedTags, searchBookmarks]);

  // Display: backend-filtered results when available, otherwise all bookmarks
  const filteredBookmarks = useMemo(() => {
    return searchResults ?? allBookmarks;
  }, [allBookmarks, searchResults]);

  const visibleBookmarks = useMemo(
    () => filteredBookmarks.slice(0, displayCount),
    [filteredBookmarks, displayCount],
  );

  const hasMore = displayCount < filteredBookmarks.length;

  const refreshData = useCallback(async () => {
    await loadAll();
    setTagVersion(v => v + 1);
  }, [loadAll]);

  const handleSearch = useCallback((q: string) => {
    setQuery(q);
    setDisplayCount(INITIAL_LOAD);
  }, []);

  const handleTagsChange = useCallback((tags: string[]) => {
    setSelectedTags(tags);
    setDisplayCount(INITIAL_LOAD);
  }, []);

  const handleLoadMore = useCallback(() => {
    setDisplayCount((prev) => Math.min(prev + LOAD_MORE, filteredBookmarks.length));
  }, [filteredBookmarks.length]);

  const handleUpdateBookmark = useCallback(async (id: number, title: string, tags: string[], description?: string) => {
    await updateBookmark(id, title, tags, description);
    await refreshData();
  }, [updateBookmark, refreshData]);

  const handleDeleteBookmark = useCallback(async (id: number) => {
    await deleteBookmarks([id]);
    await refreshData();
  }, [deleteBookmarks, refreshData]);

  const handleAddBookmark = useCallback(async (url: string, title: string, tags: string[], description?: string) => {
    await addBookmark(url, title, tags, description);
    await refreshData();
  }, [addBookmark, refreshData]);

  return (
    <>
      <div className="shrink-0 px-4 py-3 border-b border-border">
        <div className="flex items-center gap-2">
          <SearchBar onSearch={handleSearch} loading={loading || searching} />
          <Button variant="outline" className="h-10 w-10 shrink-0 !px-0 flex items-center justify-center" onClick={() => setShowAddDialog(true)} title="添加书签">
            <Plus className="h-5 w-5" />
          </Button>
        </div>
      </div>
      <div className="flex-1 flex overflow-hidden">
        <aside className="w-56 shrink-0 border-r border-border bg-sidebar p-3 flex flex-col">
          <TagPanel key={tagVersion}
            fetchTags={fetchTags}
            selectedTags={selectedTags}
            onTagsChange={handleTagsChange}
          />
        </aside>
        <main className="flex-1 flex flex-col overflow-hidden">
          <div className="flex-1 overflow-y-auto p-3 thin-scrollbar">
            <ResultList
              bookmarks={visibleBookmarks}
              loading={loading}
              error={error}
              hasMore={hasMore}
              onLoadMore={handleLoadMore}
              onDeleteBookmark={handleDeleteBookmark}
              onUpdateBookmark={handleUpdateBookmark}
              fetchTags={fetchTags}
            />
          </div>
        </main>
      </div>

      <AddBookmarkDialog
        open={showAddDialog}
        onOpenChange={setShowAddDialog}
        onAdd={handleAddBookmark}
        fetchTags={fetchTags}
      />
    </>
  );
}
