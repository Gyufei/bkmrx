import { useMemo } from 'react';

import type { NoteFile } from '../types';
import { buildFolderTree } from './buildFolderTree';
import FolderTree from './FolderTree';
import CollapsibleSidebar from '@/components/CollapsibleSidebar';

interface NotesSidebarProps {
  notes: NoteFile[];
  selectedFolder: string | null;
  onSelectFolder: (path: string | null) => void;
  onDeleteFolder: (folder: { path: string; name: string }) => void;
}

export default function NotesSidebar({
  notes,
  selectedFolder,
  onSelectFolder,
  onDeleteFolder,
}: NotesSidebarProps) {
  const folderTree = useMemo(() => buildFolderTree(notes), [notes]);

  return (
    <CollapsibleSidebar
      title={`共 ${notes.length} 篇笔记`}
      className="w-48"
      contentClassName="flex flex-col px-2 pb-2"
    >
      <FolderTree
        tree={folderTree}
        selectedPath={selectedFolder}
        onSelect={onSelectFolder}
        onDelete={onDeleteFolder}
      />
    </CollapsibleSidebar>
  );
}
