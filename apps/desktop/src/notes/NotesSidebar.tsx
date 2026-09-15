import type { WorkspaceDirectory } from '../types';
import FolderTree from './FolderTree';
import CollapsibleSidebar from '@/components/CollapsibleSidebar';

interface NotesSidebarProps {
  workspaceKey: string;
  root: WorkspaceDirectory;
  selectedFolder: string;
  onSelectFolder: (path: string) => void;
  onDeleteFolder: (folder: { path: string; name: string }) => void;
}

export default function NotesSidebar({
  workspaceKey,
  root,
  selectedFolder,
  onSelectFolder,
  onDeleteFolder,
}: NotesSidebarProps) {
  return (
    <CollapsibleSidebar title="笔记" className="w-48" contentClassName="flex flex-col px-2 pb-2">
      <FolderTree
        key={workspaceKey}
        root={root}
        selectedPath={selectedFolder}
        onSelect={onSelectFolder}
        onDelete={onDeleteFolder}
      />
    </CollapsibleSidebar>
  );
}
