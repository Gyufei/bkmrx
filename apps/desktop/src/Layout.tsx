import { useState } from 'react';
import NotesPanel from './notes/NotesPanel';
import SettingsPage from './settings/SettingsPage';
import BookmarkView from './bookmarks/BookmarkView';
import TodoPage from './todos/TodoPage';

import NavBar, { PATHS } from './Navbar';

export default function AppHome() {
  const [currentPath, setCurrentPath] = useState<PATHS>(PATHS.BOOKMARKS);

  return (
    <div className="h-screen flex flex-col bg-background text-foreground">
      <NavBar currentPath={currentPath} onCurrentPathChange={setCurrentPath} />

      {currentPath === PATHS.SETTINGS ? (
        <SettingsPage />
      ) : currentPath === PATHS.BOOKMARKS ? (
        <BookmarkView />
      ) : currentPath === PATHS.NOTES ? (
        <NotesPanel />
      ) : (
        <TodoPage />
      )}
    </div>
  );
}
