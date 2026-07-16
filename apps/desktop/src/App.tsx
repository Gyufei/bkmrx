import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import Fuse from "fuse.js";
import { useBkmr } from "./bookmarks/useBkmr";
import { useNotes } from "./notes/useNotes";
import { useSettings } from "./settings/useSettings";
import NotesPanel from "./notes/NotesPanel";
import SettingsPage from "./settings/SettingsPage";
import type { Bookmark } from "./types";
import AddBookmarkDialog from "./bookmarks/AddBookmarkDialog";
import { Button } from "./ui/button";
import BookmarkView from "./bookmarks/BookmarkView";

const TABS = [
  { id: "bookmarks", label: "书签" },
  { id: "notes", label: "笔记" },
] as const;

type TabId = (typeof TABS)[number]["id"];

const INITIAL_LOAD = 50;
const LOAD_MORE = 50;

export default function App() {
  const {
    allBookmarks, loading, error,
    loadAll, fetchTags, backup, addBookmark, deleteBookmarks, updateBookmark,
  } = useBkmr();

  const notes = useNotes();
  const settings = useSettings();

  const [activeTab, setActiveTab] = useState<TabId>("bookmarks");
  const [showSettings, setShowSettings] = useState(false);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [displayCount, setDisplayCount] = useState(INITIAL_LOAD);
  const [serverRunning, setServerRunning] = useState(false);
  const [tagVersion, setTagVersion] = useState(0);
  const [showAddDialog, setShowAddDialog] = useState(false);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      e.preventDefault();
    };
    document.addEventListener("contextmenu", handler);
    return () => document.removeEventListener("contextmenu", handler);
  }, []);

  useEffect(() => {
    invoke<{ running: boolean }>("get_server_status")
      .then((s) => setServerRunning(s.running))
      .catch(() => { });
  }, []);

  // Load settings on startup
  useEffect(() => {
    settings.load().then((s) => {
      if (s.backup_dir) {
        backup(s.backup_dir).catch(() => { });
      }
    });
  }, []);

  // Auto-scan notes when settings has a notes_dir
  useEffect(() => {
    if (settings.settings.notes_dir && notes.notes.length === 0) {
      notes.scanDir(settings.settings.notes_dir).catch(() => { });
    }
  }, [settings.settings.notes_dir]);

  // Load all bookmarks on startup
  useEffect(() => {
    loadAll();
  }, [loadAll]);

  // Reload bookmarks when notified by HTTP server (Chrome extension add/update)
  useEffect(() => {
    const unlisten = listen("bookmarks-changed", () => {
      loadAll();
      setTagVersion(v => v + 1);
    });
    return () => { unlisten.then(fn => fn()); };
  }, [loadAll, setTagVersion]);

  // Build Fuse.js index when allBookmarks changes
  const fuseRef = useRef<Fuse<Bookmark> | null>(null);
  useEffect(() => {
    fuseRef.current = allBookmarks.length > 0
      ? new Fuse(allBookmarks, {
        keys: [
          { name: "title", weight: 0.5 },
          { name: "url", weight: 0.2 },
          { name: "tags", weight: 0.2 },
          { name: "description", weight: 0.1 },
        ],
        threshold: 0.4,
        includeScore: true,
      })
      : null;
  }, [allBookmarks]);

  // Local fuzzy search + tag intersection
  const filteredBookmarks = useMemo(() => {
    const fuse = fuseRef.current;
    let results: Bookmark[];
    if (query.trim()) {
      results = fuse ? fuse.search(query.trim()).map((r) => r.item) : [];
    } else {
      results = allBookmarks;
    }
    if (selectedTags.length > 0) {
      results = results.filter((bm) =>
        selectedTags.every((t) => bm.tags.includes(t)),
      );
    }
    return results;
  }, [allBookmarks, query, selectedTags]);

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

  const visibleBookmarks = useMemo(
    () => filteredBookmarks.slice(0, displayCount),
    [filteredBookmarks, displayCount],
  );

  const hasMore = displayCount < filteredBookmarks.length;
  const notesDir = settings.settings.notes_dir;

  const switchTab = useCallback((id: TabId) => {
    setActiveTab(id);
    setShowSettings(false);
  }, []);

  const toggleSettings = useCallback(() => {
    setShowSettings((v) => !v);
  }, []);

  const handleAddBookmark = useCallback(async (url: string, title: string, tags: string[], description?: string) => {
    await addBookmark(url, title, tags, description);
    await loadAll();
    setTagVersion(v => v + 1);
  }, [addBookmark, loadAll, setTagVersion]);

  const handleDeleteBookmark = useCallback(async (id: number) => {
    await deleteBookmarks([id]);
    await loadAll();
    setTagVersion(v => v + 1);
  }, [deleteBookmarks, loadAll, setTagVersion]);

  return (
    <div className="h-screen flex flex-col bg-surface dark:bg-surface-dark text-text-primary dark:text-text-dark-primary">
      {/* Tab bar */}
      <div className="shrink-0 flex items-center justify-between px-4 py-2.5 border-b border-border dark:border-border-dark">
        <div className="flex items-center gap-3">
          {/* Tab pills */}
          <div className="inline-flex items-center gap-1 rounded-lg bg-surface-sidebar dark:bg-surface-dark-sidebar p-1">
            {TABS.map((tab) => (
              <Button variant="ghost" size="sm"
                key={tab.id}
                onClick={() => switchTab(tab.id)}
                className={`px-3 py-1.5 h-auto rounded-md transition-all ${activeTab === tab.id && !showSettings
                  ? "bg-white dark:bg-[#3f3f46] text-accent dark:text-accent-dark shadow-sm"
                  : "text-text-secondary dark:text-text-dark-secondary hover:text-text-primary dark:hover:text-text-dark-primary"
                  }`}
              >
                {tab.label}
              </Button>
            ))}
          </div>

          {/* Context info next to tabs */}
          {activeTab === "bookmarks" && !showSettings && (
            <div className="flex items-center gap-1.5 text-xs text-text-secondary dark:text-text-dark-secondary">
              <span className={`w-2 h-2 rounded-full ${serverRunning ? "bg-green-500" : "bg-red-500"}`} />
              <span className="hidden sm:inline">http://127.0.0.1:8733</span>
              <span className="sm:hidden">API</span>
            </div>
          )}
          {activeTab === "notes" && !showSettings && (
            <div className="flex items-center gap-1 text-xs text-text-secondary dark:text-text-dark-secondary">
              {notes.notes.length} 篇
            </div>
          )}
        </div>


        <Button variant="ghost" size="icon-sm"
          onClick={toggleSettings}
          className={`${showSettings ? "text-accent dark:text-accent-dark bg-accent/10 dark:bg-accent-dark/10" : ""}`}
          title="设置"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
        </Button>
      </div>

      {/* Content area */}
      {showSettings ? (
        <SettingsPage
          settings={settings.settings}
          onSave={settings.save}
          onBackupNow={backup}
        />
      ) : activeTab === "bookmarks" ? (
        <BookmarkView
          tagVersion={tagVersion}
          fetchTags={fetchTags}
          selectedTags={selectedTags}
          onTagsChange={handleTagsChange}
          onSearch={handleSearch}
          loading={loading}
          visibleBookmarks={visibleBookmarks}
          error={error}
          hasMore={hasMore}
          onLoadMore={handleLoadMore}
          onDeleteBookmark={handleDeleteBookmark}
          onUpdateBookmark={updateBookmark}
          onOpenAddDialog={() => setShowAddDialog(true)}
        />
      ) : (
        notesDir ? (
          <NotesPanel
            notesDir={notesDir}
            scanDir={notes.scanDir}
            readFile={notes.readFile}
            saveFile={notes.saveFile}
            createFile={notes.createFile}
            notes={notes.notes}
            loading={notes.loading}
            error={notes.error}
          onDeleteNote={notes.deleteNote}
          />
        ) : (
          <div className="flex-1 flex items-center justify-center text-text-secondary dark:text-text-dark-secondary">
            <div className="text-center">
              <svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="mx-auto mb-3 opacity-40">
                <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
                <polyline points="14 2 14 8 20 8" />
              </svg>
              <div className="text-base font-medium mb-1">未设置笔记目录</div>
              <div className="text-sm opacity-60">请点击右上角齿轮⚙打开设置</div>
            </div>
          </div>
        )
      )}

      <AddBookmarkDialog
        open={showAddDialog}
        onOpenChange={setShowAddDialog}
        onAdd={handleAddBookmark}
      />
    </div>
  );
}
