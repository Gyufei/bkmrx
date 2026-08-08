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

interface TodoListItemProps {
  todo: Todo;
  tags: TodoTag[];
  statusPending: boolean;
  onEdit: (todo: Todo) => void;
  onSelectTag: (tagId: number) => void;
  onSetStatus: (id: number, status: TodoStatus) => void;
  onDelete: (id: number) => void;
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
  onEdit,
  onSelectTag,
  onSetStatus,
  onDelete,
}: TodoListItemProps) {
  const toggleStatus = () =>
    onSetStatus(todo.id, todo.status === 'completed' ? 'in_progress' : 'completed');

  return (
    <ContextMenu>
      <ContextMenuTrigger className="flex w-full items-start gap-3 rounded-2xl px-3 py-3 hover:bg-muted/60">
        <span className="mt-0.5 shrink-0" onClick={(event) => event.stopPropagation()}>
          <StatusToggle todo={todo} disabled={statusPending} onToggle={toggleStatus} />
        </span>
        <button className="min-w-0 flex-1 text-left" onClick={() => onEdit(todo)}>
          <div
            className={cn(
              'font-medium',
              todo.status === 'completed' && 'text-muted-foreground line-through',
            )}
          >
            {todo.title}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            {todo.tags.map((name) => {
              const tag = tags.find((item) => item.name.toLowerCase() === name.toLowerCase());
              return (
                <span
                  key={name}
                  onClick={(event) => {
                    event.stopPropagation();
                    if (tag) onSelectTag(tag.id);
                  }}
                  className="rounded-md px-2 py-0.5 text-xs"
                  style={tagColor(name)}
                >
                  {name}
                </span>
              );
            })}
            {todo.is_high_priority && (
              <span className="rounded-md bg-rose-500/10 px-2 py-0.5 text-xs font-medium text-rose-500">
                高
              </span>
            )}
          </div>
        </button>
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
        <ContextMenuItem variant="destructive" onClick={() => onDelete(todo.id)}>
          <Trash2 />
          删除
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}
