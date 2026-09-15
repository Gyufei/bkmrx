import { Copy, Folder, FolderOpen, Trash2, Warehouse } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import type { WorkspaceDirectory } from '../types';

interface Props {
  root: WorkspaceDirectory;
  selectedPath: string;
  onSelect: (path: string) => void;
  onDelete: (folder: { path: string; name: string }) => void;
}

function FolderRow({
  directory,
  depth,
  expanded,
  selectedPath,
  onSelect,
  onToggle,
  onDelete,
}: {
  directory: WorkspaceDirectory;
  depth: number;
  expanded: Set<string>;
  selectedPath: string;
  onSelect: (path: string) => void;
  onToggle: (path: string) => void;
  onDelete: (folder: { path: string; name: string }) => void;
}) {
  const isRoot = directory.relative_path === '';
  const isExpanded = isRoot || expanded.has(directory.relative_path);
  const hasChildren = directory.directories.length > 0;
  const DirectoryIcon = isRoot ? Warehouse : isExpanded ? FolderOpen : Folder;
  const row = (
    <button
      onClick={() => {
        onSelect(directory.relative_path);
        if (!isRoot && hasChildren) onToggle(directory.relative_path);
      }}
      aria-expanded={hasChildren ? isExpanded : undefined}
      className={`flex w-full items-center gap-1 rounded-md px-2 py-1 text-left text-sm transition-colors ${
        selectedPath === directory.relative_path
          ? 'bg-primary/15'
          : 'text-muted-foreground hover:bg-accent/20 hover:text-foreground dark:hover:text-foreground'
      }`}
      style={{ paddingLeft: `${8 + depth * 16}px` }}
    >
      {hasChildren && !isRoot ? (
        <span
          aria-hidden="true"
          className={`w-3 shrink-0 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
        >
          ›
        </span>
      ) : (
        <span className="w-3 shrink-0" />
      )}
      <DirectoryIcon aria-hidden="true" className="size-3.5 shrink-0 opacity-60" />
      <span className="truncate">{directory.name}</span>
    </button>
  );

  return (
    <div>
      {isRoot ? (
        row
      ) : (
        <ContextMenu>
          <ContextMenuTrigger>{row}</ContextMenuTrigger>
          <ContextMenuContent>
            <ContextMenuItem
              onClick={() => navigator.clipboard.writeText(directory.relative_path).catch(() => {})}
            >
              <Copy className="h-4 w-4" />
              <span>复制路径</span>
            </ContextMenuItem>
            <ContextMenuSeparator />
            <ContextMenuItem
              variant="destructive"
              onClick={() => onDelete({ path: directory.relative_path, name: directory.name })}
            >
              <Trash2 className="h-4 w-4" />
              <span className="text-destructive">删除</span>
            </ContextMenuItem>
          </ContextMenuContent>
        </ContextMenu>
      )}
      {hasChildren &&
        isExpanded &&
        directory.directories.map((child) => (
          <FolderRow
            key={child.relative_path}
            directory={child}
            depth={depth + 1}
            expanded={expanded}
            selectedPath={selectedPath}
            onSelect={onSelect}
            onToggle={onToggle}
            onDelete={onDelete}
          />
        ))}
    </div>
  );
}

export default function FolderTree({ root, selectedPath, onSelect, onDelete }: Props) {
  const [expanded, setExpanded] = useState<Set<string>>(
    () => new Set(root.directories.map((directory) => directory.relative_path)),
  );
  const handleToggle = useCallback((path: string) => {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }, []);

  useEffect(() => {
    const existingPaths = new Set<string>();
    const collectPaths = (directory: WorkspaceDirectory) => {
      for (const child of directory.directories) {
        existingPaths.add(child.relative_path);
        collectPaths(child);
      }
    };
    collectPaths(root);
    setExpanded((current) => new Set([...current].filter((path) => existingPaths.has(path))));
  }, [root]);

  return (
    <div className="flex-1 overflow-y-auto py-1">
      <FolderRow
        directory={root}
        depth={0}
        expanded={expanded}
        selectedPath={selectedPath}
        onSelect={onSelect}
        onToggle={handleToggle}
        onDelete={onDelete}
      />
    </div>
  );
}
