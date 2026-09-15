import {
  Braces,
  Copy,
  FileCode2,
  FileJson2,
  FileQuestion,
  FileText,
  Pencil,
  Plus,
  Trash2,
} from 'lucide-react';
import { useMemo, useState } from 'react';

import { Button } from '@/components/ui/button';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import { Empty, EmptyDescription } from '@/components/ui/empty';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { Spinner } from '@/components/ui/spinner';
import { cn } from '@/lib/utils';
import type { NoteFile, WorkspaceFile } from '../types';

interface NotesListProps {
  files: WorkspaceFile[];
  notes: NoteFile[];
  loading: boolean;
  selectedFilePath: string | null;
  onSelectMarkdown: (note: NoteFile) => void;
  onOpenExternal: (file: WorkspaceFile) => void;
  onCreateNote: () => void;
  onRenameNote: (note: NoteFile) => void;
  onDeleteNote: (note: NoteFile) => void;
}

function displayName(name: string) {
  const extensionIndex = name.lastIndexOf('.');
  return extensionIndex > 0 ? name.slice(0, extensionIndex) : name;
}

function FileTypeIcon({ name }: { name: string }) {
  const extension = name.split('.').pop()?.toLowerCase();
  if (extension === 'md' || extension === 'markdown') return <FileText data-file-kind="markdown" />;
  if (extension === 'html' || extension === 'htm') return <FileCode2 data-file-kind="html" />;
  if (extension === 'json') return <FileJson2 data-file-kind="json" />;
  if (extension === 'js' || extension === 'mjs' || extension === 'cjs') {
    return <Braces data-file-kind="javascript" />;
  }
  return <FileQuestion data-file-kind="unknown" />;
}

export default function NotesList({
  files,
  notes,
  loading,
  selectedFilePath,
  onSelectMarkdown,
  onOpenExternal,
  onCreateNote,
  onRenameNote,
  onDeleteNote,
}: NotesListProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const filteredFiles = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return query ? files.filter((file) => file.name.toLowerCase().includes(query)) : files;
  }, [files, searchQuery]);
  const notesByPath = useMemo(
    () => new Map(notes.map((note) => [note.relative_path, note])),
    [notes],
  );

  const fileButton = (file: WorkspaceFile) => (
    <button
      aria-label={file.name}
      title={file.name}
      onClick={() => {
        const note = notesByPath.get(file.relative_path);
        if (file.kind === 'markdown' && note) onSelectMarkdown(note);
        else if (file.kind === 'external') onOpenExternal(file);
      }}
      className={cn(
        'flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left transition-colors',
        selectedFilePath === file.relative_path ? 'bg-primary/15' : 'hover:bg-accent/50',
      )}
    >
      <span aria-hidden="true" className="size-4 shrink-0 text-muted-foreground [&>svg]:size-4">
        <FileTypeIcon name={file.name} />
      </span>
      <span className="block truncate text-sm font-medium text-foreground">
        {displayName(file.name)}
      </span>
    </button>
  );

  return (
    <div className="relative flex w-56 shrink-0 flex-col bg-sidebar">
      <Separator orientation="vertical" className="absolute right-0" />
      <div className="shrink-0 px-3 pt-3 pb-2">
        <div className="mb-2 text-xs text-muted-foreground">共 {files.length} 个文件</div>
        <Input
          type="text"
          value={searchQuery}
          onChange={(event) => setSearchQuery(event.target.value)}
          placeholder="搜索文件..."
          className="h-7 rounded-md px-2.5 text-xs"
        />
      </div>
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div
            role="status"
            className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground"
          >
            <Spinner />
            扫描中...
          </div>
        ) : filteredFiles.length === 0 ? (
          <Empty className="py-8">
            <EmptyDescription>无匹配文件</EmptyDescription>
          </Empty>
        ) : (
          <div className="flex flex-col gap-1 px-2 pb-2">
            {filteredFiles.map((file) => {
              const note =
                file.kind === 'markdown' ? notesByPath.get(file.relative_path) : undefined;
              if (!note) {
                return (
                  <ContextMenu key={file.relative_path}>
                    <ContextMenuTrigger>{fileButton(file)}</ContextMenuTrigger>
                    <ContextMenuContent>
                      <ContextMenuItem
                        onClick={() =>
                          navigator.clipboard.writeText(file.relative_path).catch(() => {})
                        }
                      >
                        <Copy className="h-4 w-4" />
                        <span>复制文件路径</span>
                      </ContextMenuItem>
                    </ContextMenuContent>
                  </ContextMenu>
                );
              }
              return (
                <ContextMenu key={file.relative_path}>
                  <ContextMenuTrigger>{fileButton(file)}</ContextMenuTrigger>
                  <ContextMenuContent>
                    <ContextMenuItem onClick={() => onRenameNote(note)}>
                      <Pencil className="h-4 w-4" />
                      <span>重命名</span>
                    </ContextMenuItem>
                    <ContextMenuItem
                      onClick={() =>
                        navigator.clipboard.writeText(file.relative_path).catch(() => {})
                      }
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
              );
            })}
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
