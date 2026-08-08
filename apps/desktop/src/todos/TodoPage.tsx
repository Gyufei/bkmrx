import { useCallback, useEffect, useMemo, useState } from 'react';
import { listen } from '@tauri-apps/api/event';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CircleCheck,
  CircleDot,
  CirclePause,
  CircleX,
  Pencil,
  Play,
  Plus,
  Tag as TagIcon,
  Trash2,
} from 'lucide-react';
import { toast } from '@/components/ui/toast';
import type { CreateTodo, Todo, TodoStatus, TodoTag } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { tagColor } from '@/lib/tagColor';
import {
  createTodoApi,
  deleteTodoApi,
  deleteTodoTagApi,
  getTodoTagsApi,
  queryTodosApi,
  renameTodoTagApi,
  setTodoStatusApi,
  TODO_QUERY_KEY,
  TODO_TAGS_QUERY_KEY,
  todoQueryKey,
  updateTodoApi,
} from './todos.api';
import TodoDialog from './TodoDialog';

const STATUS_TABS: Array<{ value: TodoStatus | 'all'; label: string }> = [
  { value: 'all', label: '全部' },
  { value: 'in_progress', label: '进行中' },
  { value: 'completed', label: '已完成' },
  { value: 'suspended', label: '挂起' },
  { value: 'canceled', label: '已取消' },
];

function statusIcon(todo: Todo, onToggle: () => void, disabled: boolean) {
  if (todo.status === 'completed')
    return (
      <button aria-label="标记为进行中" disabled={disabled} onClick={onToggle}>
        <CircleCheck className="size-6 text-emerald-500" />
      </button>
    );
  if (todo.status === 'in_progress')
    return (
      <button aria-label="标记为已完成" disabled={disabled} onClick={onToggle}>
        <CircleDot className="size-6 text-violet-500" />
      </button>
    );
  if (todo.status === 'suspended')
    return <CirclePause aria-label="已挂起" className="size-6 text-amber-500" />;
  return <CircleX aria-label="已取消" className="size-6 text-rose-500" />;
}

export default function TodoPage() {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<TodoStatus | 'all'>('all');
  const [tagId, setTagId] = useState<number | null>(null);
  const [quickTitle, setQuickTitle] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Todo | null>(null);
  const [renaming, setRenaming] = useState<TodoTag | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [deletingTag, setDeletingTag] = useState<TodoTag | null>(null);

  const request = { status: status === 'all' ? null : status, tag_id: tagId };
  const todos = useQuery({
    queryKey: todoQueryKey(request),
    queryFn: () => queryTodosApi(request),
  });
  const overview = useQuery({
    queryKey: todoQueryKey({ status: null, tag_id: null }),
    queryFn: () => queryTodosApi({ status: null, tag_id: null }),
  });
  const tags = useQuery({ queryKey: TODO_TAGS_QUERY_KEY, queryFn: getTodoTagsApi });

  const invalidate = useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: TODO_QUERY_KEY }),
      queryClient.invalidateQueries({ queryKey: TODO_TAGS_QUERY_KEY }),
    ]);
  }, [queryClient]);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    listen('todos-changed', invalidate)
      .then((value) => {
        unlisten = value;
      })
      .catch(() => {
        // Browser previews do not expose the Tauri event bridge.
      });
    return () => unlisten?.();
  }, [queryClient]);

  const reportError = (error: unknown) => {
    const message =
      error instanceof Error
        ? error.message
        : typeof error === 'object' && error !== null && 'message' in error
          ? String(error.message)
          : 'Todo 操作失败';
    toast.add({ title: message, type: 'error' });
  };
  const createMutation = useMutation({
    mutationFn: createTodoApi,
    onSuccess: invalidate,
    onError: reportError,
  });
  const updateMutation = useMutation({
    mutationFn: ({ id, input }: { id: number; input: CreateTodo }) => updateTodoApi(id, input),
    onSuccess: invalidate,
    onError: reportError,
  });
  const statusMutation = useMutation({
    mutationFn: ({ id, next }: { id: number; next: TodoStatus }) => setTodoStatusApi(id, next),
    onSuccess: invalidate,
    onError: reportError,
  });
  const deleteMutation = useMutation({
    mutationFn: deleteTodoApi,
    onSuccess: invalidate,
    onError: reportError,
  });
  const renameMutation = useMutation({
    mutationFn: ({ id, name }: { id: number; name: string }) => renameTodoTagApi(id, name),
    onSuccess: async (tag) => {
      setTagId((current) => (current === renaming?.id ? tag.id : current));
      await invalidate();
    },
    onError: reportError,
  });
  const deleteTagMutation = useMutation({
    mutationFn: deleteTodoTagApi,
    onSuccess: async () => {
      if (tagId === deletingTag?.id) setTagId(null);
      await invalidate();
    },
    onError: reportError,
  });

  const selectedTag = useMemo(
    () => tags.data?.find((tag) => tag.id === tagId) ?? null,
    [tags.data, tagId],
  );
  const emptyText =
    todos.data?.total === 0
      ? tagId
        ? '该标签下暂无任务'
        : '还没有任务，创建一个开始吧'
      : `没有${STATUS_TABS.find((item) => item.value === status)?.label ?? ''}任务`;

  const saveDialog = async (input: CreateTodo) => {
    if (editing) await updateMutation.mutateAsync({ id: editing.id, input });
    else await createMutation.mutateAsync(input);
  };

  return (
    <div className="flex min-h-0 flex-1">
      <aside className="w-64 shrink-0 overflow-y-auto border-r border-border bg-sidebar/50 p-4">
        <h2 className="mb-3 px-2 text-sm font-semibold text-muted-foreground">分类</h2>
        <button
          onClick={() => setTagId(null)}
          className={`flex w-full items-center justify-between rounded-xl px-3 py-2 text-left ${tagId === null ? 'bg-muted font-medium' : 'hover:bg-muted/60'}`}
        >
          <span>所有任务</span>
          <span className="text-xs text-muted-foreground">{overview.data?.total ?? 0}</span>
        </button>
        <div className="mt-2 space-y-1">
          {tags.data?.map((tag) => (
            <ContextMenu key={tag.id}>
              <ContextMenuTrigger
                className={`flex w-full items-center justify-between rounded-xl px-3 py-2 text-left ${tagId === tag.id ? 'bg-muted font-medium' : 'hover:bg-muted/60'}`}
                onClick={() => setTagId(tag.id)}
              >
                <span className="flex min-w-0 items-center gap-2">
                  <TagIcon className="size-4 shrink-0" />
                  <span className="truncate">{tag.name}</span>
                </span>
                <span className="text-xs text-muted-foreground">{tag.count}</span>
              </ContextMenuTrigger>
              <ContextMenuContent>
                <ContextMenuItem
                  onClick={() => {
                    setRenaming(tag);
                    setRenameValue(tag.name);
                  }}
                >
                  <Pencil />
                  重命名
                </ContextMenuItem>
                <ContextMenuItem variant="destructive" onClick={() => setDeletingTag(tag)}>
                  <Trash2 />
                  删除
                </ContextMenuItem>
              </ContextMenuContent>
            </ContextMenu>
          ))}
        </div>
      </aside>

      <main className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between px-8 py-5">
          <h1 className="text-2xl font-semibold">{selectedTag?.name ?? '所有任务'}</h1>
          <Button
            onClick={() => {
              setEditing(null);
              setDialogOpen(true);
            }}
          >
            <Plus />
            新建任务
          </Button>
        </header>
        <div className="px-8 pb-4">
          <Input
            value={quickTitle}
            disabled={createMutation.isPending}
            onChange={(event) => setQuickTitle(event.target.value)}
            onKeyDown={async (event) => {
              if (event.key !== 'Enter' || !quickTitle.trim() || createMutation.isPending) return;
              try {
                await createMutation.mutateAsync({
                  title: quickTitle,
                  description: '',
                  tags: [],
                  is_high_priority: false,
                });
                setQuickTitle('');
              } catch {
                /* toast is handled by mutation */
              }
            }}
            placeholder="快速添加任务，按 Enter 提交…"
            className="h-12 bg-muted/60"
          />
        </div>
        <Tabs
          value={status}
          onValueChange={(value) => setStatus(value as TodoStatus | 'all')}
          className="border-b border-border px-8 pb-3"
        >
          <TabsList variant="line">
            {STATUS_TABS.map((tab) => (
              <TabsTrigger key={tab.value} value={tab.value}>
                {tab.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        <div className="min-h-0 flex-1 overflow-y-auto px-8 py-4">
          {todos.isLoading ? (
            <p className="py-10 text-center text-muted-foreground">正在加载任务…</p>
          ) : todos.isError ? (
            <p role="alert" className="py-10 text-center text-destructive">
              任务加载失败
            </p>
          ) : todos.data?.items.length === 0 ? (
            <p className="py-10 text-center text-muted-foreground">{emptyText}</p>
          ) : (
            <div className="space-y-1">
              {todos.data?.items.map((todo) => (
                <ContextMenu key={todo.id}>
                  <ContextMenuTrigger className="flex w-full items-start gap-3 rounded-2xl px-3 py-3 hover:bg-muted/60">
                    <span className="mt-0.5 shrink-0" onClick={(event) => event.stopPropagation()}>
                      {statusIcon(
                        todo,
                        () =>
                          statusMutation.mutate({
                            id: todo.id,
                            next: todo.status === 'completed' ? 'in_progress' : 'completed',
                          }),
                        statusMutation.isPending,
                      )}
                    </span>
                    <button
                      className="min-w-0 flex-1 text-left"
                      onClick={() => {
                        setEditing(todo);
                        setDialogOpen(true);
                      }}
                    >
                      <div
                        className={`font-medium ${todo.status === 'completed' ? 'text-muted-foreground line-through' : ''}`}
                      >
                        {todo.title}
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-1.5">
                        {todo.tags.map((name) => {
                          const tag = tags.data?.find(
                            (item) => item.name.toLowerCase() === name.toLowerCase(),
                          );
                          return (
                            <span
                              key={name}
                              onClick={(event) => {
                                event.stopPropagation();
                                if (tag) setTagId(tag.id);
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
                    <ContextMenuItem
                      onClick={() => {
                        setEditing(todo);
                        setDialogOpen(true);
                      }}
                    >
                      <Pencil />
                      编辑
                    </ContextMenuItem>
                    {todo.status === 'in_progress' && (
                      <ContextMenuItem
                        onClick={() => statusMutation.mutate({ id: todo.id, next: 'suspended' })}
                      >
                        <CirclePause />
                        挂起
                      </ContextMenuItem>
                    )}
                    {todo.status === 'suspended' && (
                      <ContextMenuItem
                        onClick={() => statusMutation.mutate({ id: todo.id, next: 'in_progress' })}
                      >
                        <Play />
                        取消挂起
                      </ContextMenuItem>
                    )}
                    {(todo.status === 'completed' || todo.status === 'canceled') && (
                      <ContextMenuItem
                        onClick={() => statusMutation.mutate({ id: todo.id, next: 'in_progress' })}
                      >
                        <Play />
                        重新打开
                      </ContextMenuItem>
                    )}
                    {(todo.status === 'in_progress' || todo.status === 'suspended') && (
                      <ContextMenuItem
                        onClick={() => statusMutation.mutate({ id: todo.id, next: 'canceled' })}
                      >
                        <CircleX />
                        取消任务
                      </ContextMenuItem>
                    )}
                    <ContextMenuSeparator />
                    <ContextMenuItem
                      variant="destructive"
                      onClick={() => deleteMutation.mutate(todo.id)}
                    >
                      <Trash2 />
                      删除
                    </ContextMenuItem>
                  </ContextMenuContent>
                </ContextMenu>
              ))}
            </div>
          )}
        </div>
        <footer className="shrink-0 px-8 py-4 text-sm text-muted-foreground">
          {todos.data?.total ?? 0} 个任务 · {todos.data?.completed ?? 0} 个已完成
        </footer>
      </main>

      <TodoDialog
        open={dialogOpen}
        todo={editing}
        availableTags={tags.data ?? []}
        onOpenChange={setDialogOpen}
        onSave={saveDialog}
      />

      <Dialog open={Boolean(renaming)} onOpenChange={(open) => !open && setRenaming(null)}>
        <DialogContent>
          <form
            onSubmit={async (event) => {
              event.preventDefault();
              if (!renaming || !renameValue.trim()) return;
              try {
                await renameMutation.mutateAsync({ id: renaming.id, name: renameValue });
                setRenaming(null);
              } catch {
                /* toast handled */
              }
            }}
            className="grid gap-5"
          >
            <DialogHeader>
              <DialogTitle>重命名标签</DialogTitle>
            </DialogHeader>
            <Input
              value={renameValue}
              onChange={(event) => setRenameValue(event.target.value)}
              autoFocus
            />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setRenaming(null)}>
                取消
              </Button>
              <Button type="submit" disabled={!renameValue.trim() || renameMutation.isPending}>
                保存
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={Boolean(deletingTag)}
        onOpenChange={(open) => !open && setDeletingTag(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>删除标签“{deletingTag?.name}”？</AlertDialogTitle>
            <AlertDialogDescription>
              只会删除标签及其任务关联，不会删除任何任务。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel render={<Button variant="outline" />}>取消</AlertDialogCancel>
            <AlertDialogAction
              disabled={deleteTagMutation.isPending}
              onClick={async () => {
                if (!deletingTag) return;
                try {
                  await deleteTagMutation.mutateAsync(deletingTag.id);
                  setDeletingTag(null);
                } catch {
                  /* toast handled */
                }
              }}
            >
              删除标签
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
