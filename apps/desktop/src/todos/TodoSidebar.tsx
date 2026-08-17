import { Pencil, Tag as TagIcon, Trash2 } from 'lucide-react';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import { cn } from '@/lib/utils';
import type { TodoTag } from '@/types';
import CollapsibleSidebar from '@/components/CollapsibleSidebar';

interface TodoSidebarProps {
  tags: TodoTag[];
  total: number;
  selectedTagId: number | null;
  onSelectTag: (tagId: number | null) => void;
  onRenameTag: (tag: TodoTag) => void;
  onDeleteTag: (tag: TodoTag) => void;
}

const tagButtonClass = (selected: boolean) =>
  cn(
    'flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm',
    selected ? 'bg-muted font-medium' : 'hover:bg-muted/60',
  );

export default function TodoSidebar({
  tags,
  total,
  selectedTagId,
  onSelectTag,
  onRenameTag,
  onDeleteTag,
}: TodoSidebarProps) {
  return (
    <CollapsibleSidebar
      title="分类"
      className="w-56"
      contentClassName="thin-scrollbar overflow-y-auto px-3 pb-3"
    >
      <button onClick={() => onSelectTag(null)} className={tagButtonClass(selectedTagId === null)}>
        <span>所有任务</span>
        <span className="text-xs text-muted-foreground">{total}</span>
      </button>
      <div className="mt-2 flex flex-col gap-1">
        {tags.map((tag) => (
          <ContextMenu key={tag.id}>
            <ContextMenuTrigger
              className={tagButtonClass(selectedTagId === tag.id)}
              onClick={() => onSelectTag(tag.id)}
            >
              <span className="flex min-w-0 items-center gap-2">
                <TagIcon className="size-4 shrink-0" />
                <span className="truncate">{tag.name}</span>
              </span>
              <span className="text-xs text-muted-foreground">{tag.count}</span>
            </ContextMenuTrigger>
            <ContextMenuContent>
              <ContextMenuItem onClick={() => onRenameTag(tag)}>
                <Pencil />
                重命名
              </ContextMenuItem>
              <ContextMenuItem variant="destructive" onClick={() => onDeleteTag(tag)}>
                <Trash2 />
                删除
              </ContextMenuItem>
            </ContextMenuContent>
          </ContextMenu>
        ))}
      </div>
    </CollapsibleSidebar>
  );
}
