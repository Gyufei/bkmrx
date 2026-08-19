import { useEffect, useRef, useState } from 'react';
import { invokeGetServerStatus } from './lib/invoke';
import { Button } from './components/ui/button';
import { Bookmark, ListTodo, Notebook, Rss, Settings } from 'lucide-react';

import { Tabs, TabsList, TabsTrigger } from './components/ui/tabs';

export enum PATHS {
  BOOKMARKS = 'bookmarks',
  NOTES = 'notes',
  TODOS = 'todos',
  RSS = 'rss',
  SETTINGS = 'settings',
}

const TABS = [
  { id: PATHS.BOOKMARKS, label: '书签', icon: <Bookmark /> },
  { id: PATHS.NOTES, label: '笔记', icon: <Notebook /> },
  { id: PATHS.TODOS, label: 'Todo', icon: <ListTodo /> },
  { id: PATHS.RSS, label: 'RSS', icon: <Rss /> },
] as const;

export default function NavBar({
  currentPath,
  onCurrentPathChange,
}: {
  currentPath: PATHS;
  onCurrentPathChange: (path: PATHS) => void;
}) {
  const [isMac, setIsMac] = useState(false);
  const [serverRunning, setServerRunning] = useState(false);
  const [serverUrl, setServerUrl] = useState('http://127.0.0.1:8733');
  const [showServerUrl, setShowServerUrl] = useState(false);
  const serverUrlTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      e.preventDefault();
    };
    document.addEventListener('contextmenu', handler);
    return () => document.removeEventListener('contextmenu', handler);
  }, []);

  useEffect(() => {
    setIsMac(navigator.platform.toUpperCase().includes('MAC'));
  }, []);

  useEffect(() => {
    async function checkServerStatus() {
      try {
        const s = await invokeGetServerStatus();
        setServerRunning(s.running);
        setServerUrl(s.url);
      } catch {
        setServerRunning(false);
      }
    }

    checkServerStatus();
  }, []);

  useEffect(
    () => () => {
      if (serverUrlTimer.current) clearTimeout(serverUrlTimer.current);
    },
    [],
  );

  const revealServerUrl = () => {
    if (serverUrlTimer.current) clearTimeout(serverUrlTimer.current);
    setShowServerUrl(true);
    serverUrlTimer.current = setTimeout(() => {
      setShowServerUrl(false);
      serverUrlTimer.current = null;
    }, 3_000);
  };

  return (
    <div
      data-tauri-drag-region
      className={
        'shrink-0 flex items-center justify-between py-2.5 border-b border-border ' +
        (isMac ? 'pl-[80px]' : 'px-4') +
        ' pr-4'
      }
    >
      <div className="flex items-center gap-3">
        <div className="inline-flex items-center gap-1 rounded-lg bg-sidebar p-1">
          <Tabs value={currentPath} onValueChange={onCurrentPathChange} orientation="horizontal">
            <TabsList>
              {TABS.map((tab) => (
                <TabsTrigger
                  key={tab.id}
                  value={tab.id}
                  className={`px-3 py-1.5 h-auto transition-all ${
                    currentPath === tab.id
                      ? 'bg-white dark:bg-[#3f3f46] text-primary shadow-sm'
                      : 'text-muted-foreground hover:text-foreground dark:hover:text-foreground'
                  }`}
                >
                  {tab.icon}
                  {tab.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </div>

        {currentPath === PATHS.BOOKMARKS && (
          <Button
            type="button"
            variant="ghost"
            size="xs"
            className="h-auto gap-1.5 px-1 py-0.5 text-xs text-muted-foreground"
            onClick={revealServerUrl}
            aria-label="显示服务器地址"
          >
            <span
              className={`size-2 rounded-full ${serverRunning ? 'bg-green-500' : 'bg-red-500'}`}
            />
            <span>{showServerUrl ? serverUrl : 'Server Running'}</span>
          </Button>
        )}
      </div>

      <Button
        variant="ghost"
        size="icon-sm"
        onClick={() => onCurrentPathChange(PATHS.SETTINGS)}
        className={`${currentPath === PATHS.SETTINGS ? 'text-primary bg-primary/10' : ''}`}
        title="设置"
      >
        <Settings />
      </Button>
    </div>
  );
}
