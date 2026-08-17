import { Copy, Pencil, Plus, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';

import { Button } from '@/components/ui/button';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import { Input } from '@/components/ui/input';
import { Empty, EmptyDescription } from '@/components/ui/empty';
import { Separator } from '@/components/ui/separator';
import { Spinner } from '@/components/ui/spinner';
import { cn } from '@/lib/utils';
import type { NoteFile } from '../types';

interface NotesListProps {
  notes: NoteFile[];
  loading: boolean;
  selectedFolder: string | null;
  selectedFilePath: string | null;
  onSelectNote: (note: NoteFile) => void;
  onCreateNote: () => void;
  onRenameNote: (note: NoteFile) => void;
  onDeleteNote: (note: NoteFile) => void;
}

export default function NotesList({
  notes,
  loading,
  selectedFolder,
  selectedFilePath,
  onSelectNote,
  onCreateNote,
  onRenameNote,
  onDeleteNote,
}: NotesListProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const filteredNotes = useMemo(() => {
    const folderNotes = selectedFolder
      ? notes.filter((note) => note.relative_path.startsWith(`${selectedFolder}/`))
      : notes;
    const query = searchQuery.trim().toLowerCase();
    if (!query) return folderNotes;
    return folderNotes.filter(
      (note) =>
        note.title.toLowerCase().includes(query) ||
        note.tags.some((tag) => tag.toLowerCase().includes(query)),
    );
  }, [notes, searchQuery, selectedFolder]);

  return (
    <div className="relative flex w-56 shrink-0 flex-col">
      <Separator orientation="vertical" className="absolute right-0" />
      <div className="shrink-0 px-3 pt-3 pb-2">
        <Input
          type="text"
          value={searchQuery}
          onChange={(event) => setSearchQuery(event.target.value)}
          placeholder="搜索笔记..."
          className="h-7 px-2.5 text-xs rounded-md"
        />
      </div>
      <div className="flex-1 overflow-y-auto thin-scrollbar">
        {loading ? (
          <div
            role="status"
            className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground"
          >
            <Spinner />
            扫描中...
          </div>
        ) : filteredNotes.length === 0 ? (
          <Empty className="py-8">
            <EmptyDescription>无匹配笔记</EmptyDescription>
          </Empty>
        ) : (
          <div className="flex flex-col gap-1 px-2 pb-2">
            {filteredNotes.map((note) => (
              <ContextMenu key={note.path}>
                <ContextMenuTrigger>
                  <button
                    onClick={() => onSelectNote(note)}
                    className={cn(
                      'w-full rounded-md px-2.5 py-2 text-left transition-colors',
                      selectedFilePath === note.path ? 'bg-primary/15' : 'hover:bg-accent/50',
                    )}
                  >
                    <span className="block truncate text-sm font-medium text-foreground">
                      {note.title}
                    </span>
                  </button>
                </ContextMenuTrigger>
                <ContextMenuContent>
                  <ContextMenuItem onClick={() => onRenameNote(note)}>
                    <Pencil className="h-4 w-4" />
                    <span>重命名</span>
                  </ContextMenuItem>
                  <ContextMenuItem
                    onClick={() => navigator.clipboard.writeText(note.path).catch(() => {})}
                  >
                    <Copy className="h-4 w-4" />
                    <span>复制文件路径</span>
                  </ContextMenuItem>
                  <ContextMenuSeparator />
                  <ContextMenuItem onClick={() => onDeleteNote(note)}>
                    <Trash2 className="h-4 w-4" />
                    <span className="text-destructive">删除笔记</span>
                  </ContextMenuItem>
                </ContextMenuContent>
              </ContextMenu>
            ))}
          </div>
        )}
      </div>
      <Separator />
      <div className="shrink-0 p-2">
        <Button variant="ghost" size="sm" className="w-full" onClick={onCreateNote}>
          <Plus data-icon="inline-start" />
          新建笔记
        </Button>
      </div>
    </div>
  );
}
