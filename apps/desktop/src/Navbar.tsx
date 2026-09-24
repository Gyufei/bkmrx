import { useEffect, useState } from 'react';
import { invokeGetServerStatus } from './lib/invoke';
import { Button } from './components/ui/button';
import {
  Bookmark,
  CalendarDays,
  ListTodo,
  MapPinSearch,
  Notebook,
  Rss,
  Settings,
  SquareCheckBig,
  StarPlus,
} from 'lucide-react';

import { GooeyNav } from './components/GooeyNav';
import { ExpandingTabs } from './components/ExpandingTabs';

export enum PATHS {
  BOOKMARKS = 'bookmarks',
  NOTES = 'notes',
  TODOS = 'todos',
  RSS = 'rss',
  SETTINGS = 'settings',
}

export type BookmarkSubpage = 'navigation' | 'bookmarks';
export type TodoSubpage = 'todos' | 'calendar';

const TABS = [
  { id: PATHS.BOOKMARKS, label: '书签', icon: <Bookmark /> },
  { id: PATHS.NOTES, label: '笔记', icon: <Notebook /> },
  { id: PATHS.TODOS, label: 'Todo', icon: <ListTodo /> },
  { id: PATHS.RSS, label: 'RSS', icon: <Rss /> },
] as const;

const BOOKMARK_TABS = [
  { value: 'navigation', label: '导航', icon: MapPinSearch },
  { value: 'bookmarks', label: '书签', icon: StarPlus },
] as const;

const TODO_TABS = [
  { value: 'todos', label: '待办', icon: SquareCheckBig },
  { value: 'calendar', label: '日历', icon: CalendarDays },
] as const;

export default function NavBar({
  currentPath,
  onCurrentPathChange,
  bookmarkSubpage = 'navigation',
  onBookmarkSubpageChange = () => {},
  todoSubpage = 'todos',
  onTodoSubpageChange = () => {},
}: {
  currentPath: PATHS;
  onCurrentPathChange: (path: PATHS) => void;
  bookmarkSubpage?: BookmarkSubpage;
  onBookmarkSubpageChange?: (page: BookmarkSubpage) => void;
  todoSubpage?: TodoSubpage;
  onTodoSubpageChange?: (page: TodoSubpage) => void;
}) {
  const [isMac, setIsMac] = useState(false);
  const [serverRunning, setServerRunning] = useState(false);

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
      } catch {
        setServerRunning(false);
      }
    }

    checkServerStatus();
  }, []);

  return (
    <div
      data-tauri-drag-region
      className={
        'shrink-0 flex items-center justify-between bg-card py-2.5 border-b border-border ' +
        (isMac ? 'pl-20' : 'px-4') +
        ' pr-4'
      }
    >
      <div className="flex items-center gap-3">
        <GooeyNav
          items={TABS.map((tab) => ({ label: tab.label, icon: tab.icon }))}
          value={TABS.findIndex((t) => t.id === currentPath)}
          onChange={(i) => onCurrentPathChange(TABS[i].id)}
          size="sm"
        />

        {currentPath === PATHS.BOOKMARKS && (
          <ExpandingTabs
            items={BOOKMARK_TABS}
            value={bookmarkSubpage}
            onValueChange={onBookmarkSubpageChange}
            ariaLabel="书签二级页面"
          />
        )}

        {currentPath === PATHS.TODOS && (
          <ExpandingTabs
            items={TODO_TABS}
            value={todoSubpage}
            onValueChange={onTodoSubpageChange}
            ariaLabel="Todo 二级页面"
          />
        )}

        {currentPath === PATHS.BOOKMARKS && (
          <div
            className="flex items-center gap-1.5 px-1 py-0.5 text-xs text-muted-foreground"
            role="status"
          >
            <span
              className={`size-2 rounded-full ${serverRunning ? 'bg-green-500' : 'bg-red-500'}`}
            />
            <span>{serverRunning ? '连接正常' : '连接不可用'}</span>
          </div>
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
