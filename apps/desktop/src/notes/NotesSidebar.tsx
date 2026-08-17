import { useMemo } from 'react';

import type { NoteFile } from '../types';
import { buildFolderTree } from './buildFolderTree';
import FolderTree from './FolderTree';
import { Separator } from '@/components/ui/separator';

interface NotesSidebarProps {
  notes: NoteFile[];
  selectedFolder: string | null;
  onSelectFolder: (path: string | null) => void;
}

export default function NotesSidebar({ notes, selectedFolder, onSelectFolder }: NotesSidebarProps) {
  const folderTree = useMemo(() => buildFolderTree(notes), [notes]);

  return (
    <div className="relative flex w-48 shrink-0 flex-col bg-sidebar px-2">
      <Separator orientation="vertical" className="absolute right-0" />
      <div className="shrink-0 pt-3 pb-2">
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          共 {notes.length} 篇笔记
        </span>
      </div>
      <FolderTree tree={folderTree} selectedPath={selectedFolder} onSelect={onSelectFolder} />
    </div>
  );
}
