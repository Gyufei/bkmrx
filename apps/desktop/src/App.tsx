import { useState, useCallback, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import NotesPanel from "./notes/NotesPanel";
import SettingsPage from "./settings/SettingsPage";
import { Button } from "./components/ui/button";
import BookmarkView from "./bookmarks/BookmarkView";
import { Bookmark, Notebook, Settings } from "lucide-react";

import { Tabs, TabsList, TabsTrigger } from "./components/ui/tabs";

const TABS = [
  { id: "bookmarks", label: "书签", icon: <Bookmark /> },
  { id: "notes", label: "笔记", icon: <Notebook /> },
] as const;

type TabId = (typeof TABS)[number]["id"];

export default function App() {
  const [activeTab, setActiveTab] = useState<TabId>("bookmarks");
  const [showSettings, setShowSettings] = useState(false);
  const [isMac, setIsMac] = useState(false);
  const [serverRunning, setServerRunning] = useState(false);

  useEffect(() => {
    const handler = (e: MouseEvent) => { e.preventDefault(); };
    document.addEventListener("contextmenu", handler);
    return () => document.removeEventListener("contextmenu", handler);
  }, []);

  useEffect(() => {
    setIsMac(navigator.platform.toUpperCase().includes("MAC"));
  }, []);

  useEffect(() => {
    invoke<{ running: boolean }>("get_server_status")
      .then((s) => setServerRunning(s.running))
      .catch(() => { });
  }, []);

  const switchTab = useCallback((id: TabId) => {
    setActiveTab(id);
    setShowSettings(false);
  }, []);

  const toggleSettings = useCallback(() => {
    setShowSettings((v) => !v);
  }, []);

  return (
    <div className="h-screen flex flex-col bg-background text-foreground">
      <div data-tauri-drag-region className={"shrink-0 flex items-center justify-between py-2.5 border-b border-border " + (isMac ? "pl-[80px]" : "px-4") + " pr-4"}>
        <div className="flex items-center gap-3">
          <div className="inline-flex items-center gap-1 rounded-lg bg-sidebar p-1">
            <Tabs value={activeTab} onValueChange={switchTab} orientation="horizontal">
              <TabsList>
                {
                  TABS.map((tab) => (
                    <TabsTrigger
                      key={tab.id}
                      value={tab.id}
                      className={`px-3 py-1.5 h-auto transition-all ${activeTab === tab.id && !showSettings
                        ? "bg-white dark:bg-[#3f3f46] text-primary shadow-sm"
                        : "text-muted-foreground hover:text-foreground dark:hover:text-foreground"
                        }`}
                    >
                      {tab.icon}
                      {tab.label}
                    </TabsTrigger>
                  ))
                }
              </TabsList>
            </Tabs>
          </div>

          {activeTab === "bookmarks" && !showSettings && (
            <div className="flex items-center flex-1 gap-1.5 text-xs text-muted-foreground">
              <span className={`w-2 h-2 rounded-full ${serverRunning ? "bg-green-500" : "bg-red-500"}`} />
              <span className="hidden sm:inline">http://127.0.0.1:8733</span>
              <span className="sm:hidden">API</span>
            </div>
          )}
        </div>

        <Button variant="ghost" size="icon-sm"
          onClick={toggleSettings}
          className={`${showSettings ? "text-primary bg-primary/10" : ""}`}
          title="设置"
        >
          <Settings />
        </Button>
      </div>

        {showSettings ? (
          <SettingsPage />
        ) : activeTab === "bookmarks" ? (
            <BookmarkView />
        ) : (
            <NotesPanel />
        )}
    </div>
  );
}
