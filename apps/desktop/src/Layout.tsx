import { Activity, useState } from 'react';
import { useHotkeys } from '@tanstack/react-hotkeys';
import NotesPanel from './notes/NotesPanel';
import SettingsPage from './settings/SettingsPage';
import BookmarkView from './bookmarks/BookmarkView';
import TodoPage from './todos/TodoPage';
import RssPage from './rss/RssPage';

import NavBar, { PATHS } from './Navbar';

export default function AppHome() {
  const [currentPath, setCurrentPath] = useState<PATHS>(PATHS.BOOKMARKS);

  useHotkeys([
    {
      hotkey: 'Mod+1',
      callback: () => setCurrentPath(PATHS.BOOKMARKS),
      options: { meta: { name: '打开书签', description: '切换到书签工作区' } },
    },
    {
      hotkey: 'Mod+2',
      callback: () => setCurrentPath(PATHS.NOTES),
      options: { meta: { name: '打开笔记', description: '切换到笔记工作区' } },
    },
    {
      hotkey: 'Mod+3',
      callback: () => setCurrentPath(PATHS.TODOS),
      options: { meta: { name: '打开 Todo', description: '切换到 Todo 工作区' } },
    },
    {
      hotkey: 'Mod+4',
      callback: () => setCurrentPath(PATHS.RSS),
      options: { meta: { name: '打开 RSS', description: '切换到 RSS 阅读工作区' } },
    },
  ]);

  return (
    <div className="h-screen flex flex-col bg-background text-foreground">
      <NavBar currentPath={currentPath} onCurrentPathChange={setCurrentPath} />

      <Activity mode={currentPath === PATHS.BOOKMARKS ? 'visible' : 'hidden'}>
        <BookmarkView />
      </Activity>
      <Activity mode={currentPath === PATHS.NOTES ? 'visible' : 'hidden'}>
        <NotesPanel />
      </Activity>
      <Activity mode={currentPath === PATHS.TODOS ? 'visible' : 'hidden'}>
        <TodoPage />
      </Activity>
      <Activity mode={currentPath === PATHS.RSS ? 'visible' : 'hidden'}>
        <RssPage />
      </Activity>
      <Activity mode={currentPath === PATHS.SETTINGS ? 'visible' : 'hidden'}>
        <SettingsPage />
      </Activity>
    </div>
  );
}
