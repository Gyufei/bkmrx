import { Circle, CircleCheck, CirclePause, CircleX, Pencil, Play, Trash2 } from 'lucide-react';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import { tagColor } from '@/lib/tagColor';
import { cn } from '@/lib/utils';
import type { Todo, TodoStatus, TodoTag } from '@/types';
import ConfirmDeleteDialog from '@/components/ConfirmDeleteDialog';
import { useState } from 'react';
import { Badge, badgeVariants } from '@/components/ui/badge';

interface TodoListItemProps {
  todo: Todo;
  tags: TodoTag[];
  statusPending: boolean;
  deletePending: boolean;
  deleteError?: unknown;
  onEdit: (todo: Todo) => void;
  onSelectTag: (tagId: number) => void;
  onSetStatus: (id: number, status: TodoStatus) => void;
  onPrepareDelete: () => void;
  onDelete: (id: number) => Promise<void>;
}

function StatusToggle({
  todo,
  disabled,
  onToggle,
}: {
  todo: Todo;
  disabled: boolean;
  onToggle: () => void;
}) {
  if (todo.status === 'completed')
    return (
      <button aria-label="标记为进行中" disabled={disabled} onClick={onToggle}>
        <CircleCheck className="size-6 text-emerald-500" />
      </button>
    );
  if (todo.status === 'in_progress')
    return (
      <button aria-label="标记为已完成" disabled={disabled} onClick={onToggle}>
        <Circle className="size-6 text-violet-500" />
      </button>
    );
  if (todo.status === 'suspended')
    return <CirclePause aria-label="已挂起" className="size-6 text-amber-500" />;
  return <CircleX aria-label="已取消" className="size-6 text-rose-500" />;
}

export default function TodoListItem({
  todo,
  tags,
  statusPending,
  deletePending,
  deleteError,
  onEdit,
  onSelectTag,
  onSetStatus,
  onPrepareDelete,
  onDelete,
}: TodoListItemProps) {
  const [deleteOpen, setDeleteOpen] = useState(false);
  const toggleStatus = () =>
    onSetStatus(todo.id, todo.status === 'completed' ? 'in_progress' : 'completed');

  return (
    <>
      <ContextMenu>
        <ContextMenuTrigger className="flex w-full items-start gap-3 rounded-2xl px-3 py-3 hover:bg-muted/60">
          <span className="mt-0.5 shrink-0" onClick={(event) => event.stopPropagation()}>
            <StatusToggle todo={todo} disabled={statusPending} onToggle={toggleStatus} />
          </span>
          <div className="min-w-0 flex-1 text-left">
            <button className="block w-full text-left" onClick={() => onEdit(todo)}>
              <div
                className={cn(
                  'font-medium',
                  todo.status === 'completed' && 'text-muted-foreground line-through',
                )}
              >
                {todo.title}
              </div>
            </button>
            <div className="mt-1 flex flex-wrap items-center gap-1.5">
              {todo.tags.map((name) => {
                const tag = tags.find((item) => item.name.toLowerCase() === name.toLowerCase());
                return (
                  <button
                    key={name}
                    type="button"
                    aria-label={`筛选标签 ${name}`}
                    onClick={(event) => {
                      event.stopPropagation();
                      if (tag) onSelectTag(tag.id);
                    }}
                    disabled={!tag}
                    className={cn(
                      badgeVariants(),
                      'cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-default',
                    )}
                    style={tagColor(name)}
                  >
                    {name}
                  </button>
                );
              })}
              {todo.is_high_priority && <Badge variant="destructive">高</Badge>}
            </div>
          </div>
        </ContextMenuTrigger>
        <ContextMenuContent>
          <ContextMenuItem onClick={() => onEdit(todo)}>
            <Pencil />
            编辑
          </ContextMenuItem>
          {todo.status === 'in_progress' && (
            <ContextMenuItem onClick={() => onSetStatus(todo.id, 'suspended')}>
              <CirclePause />
              挂起
            </ContextMenuItem>
          )}
          {todo.status === 'suspended' && (
            <ContextMenuItem onClick={() => onSetStatus(todo.id, 'in_progress')}>
              <Play />
              取消挂起
            </ContextMenuItem>
          )}
          {(todo.status === 'completed' || todo.status === 'canceled') && (
            <ContextMenuItem onClick={() => onSetStatus(todo.id, 'in_progress')}>
              <Play />
              重新打开
            </ContextMenuItem>
          )}
          {(todo.status === 'in_progress' || todo.status === 'suspended') && (
            <ContextMenuItem onClick={() => onSetStatus(todo.id, 'canceled')}>
              <CircleX />
              取消任务
            </ContextMenuItem>
          )}
          <ContextMenuSeparator />
          <ContextMenuItem
            variant="destructive"
            onClick={() => {
              onPrepareDelete();
              setDeleteOpen(true);
            }}
          >
            <Trash2 />
            删除
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>
      <ConfirmDeleteDialog
        open={deleteOpen}
        title={`删除任务“${todo.title}”？`}
        description="此操作不可撤销。"
        pending={deletePending}
        error={deleteError}
        onOpenChange={setDeleteOpen}
        onConfirm={async () => {
          try {
            await onDelete(todo.id);
            setDeleteOpen(false);
          } catch {
            // Mutation error is displayed in the confirmation dialog.
          }
        }}
      />
    </>
  );
}
