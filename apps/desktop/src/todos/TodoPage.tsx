import { useCallback, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { save } from '@tauri-apps/plugin-dialog';
import { toast } from '@/components/ui/toast';
import type { CreateTodo, Todo, TodoStatus, TodoTag } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertTitle } from '@/components/ui/alert';
import { Empty, EmptyDescription } from '@/components/ui/empty';
import { Separator } from '@/components/ui/separator';
import { Spinner } from '@/components/ui/spinner';
import { useTauriEvent } from '@/lib/use-tauri-event';
import {
  archiveDeleteTodoTagApi,
  createTodoApi,
  deleteTodoApi,
  deleteTodoTagApi,
  exportTodosApi,
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
import TodoListItem from './TodoListItem';
import TodoSidebar from './TodoSidebar';
import TodoTagDialogs from './TodoTagDialogs';

type StatusFilter = TodoStatus | 'all';

const STATUS_TABS: Array<{ value: StatusFilter; label: string }> = [
  { value: 'all', label: '全部' },
  { value: 'in_progress', label: '进行中' },
  { value: 'completed', label: '已完成' },
  { value: 'suspended', label: '挂起' },
  { value: 'canceled', label: '已取消' },
];

function todayDate() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export default function TodoPage() {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<StatusFilter>('all');
  const [tagId, setTagId] = useState<number | null>(null);
  const [quickTitle, setQuickTitle] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Todo | null>(null);
  const [renaming, setRenaming] = useState<TodoTag | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [deletingTag, setDeletingTag] = useState<TodoTag | null>(null);
  const [archivingTag, setArchivingTag] = useState<TodoTag | null>(null);

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

  useTauriEvent('todos-changed', invalidate);

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
    onSuccess: async (tag, variables) => {
      setTagId((current) => (current === variables.id ? tag.id : current));
      await invalidate();
    },
    onError: reportError,
  });
  const deleteTagMutation = useMutation({
    mutationFn: deleteTodoTagApi,
    onSuccess: async (_result, deletedId) => {
      setTagId((current) => (current === deletedId ? null : current));
      await invalidate();
    },
    onError: reportError,
  });
  const archiveDeleteMutation = useMutation({
    mutationFn: (id: number) => archiveDeleteTodoTagApi(id),
    onSuccess: async (_result, deletedId) => {
      setTagId((current) => (current === deletedId ? null : current));
      await invalidate();
    },
    onError: reportError,
  });
  const handleArchiveDeleteTag = (tag: TodoTag) => {
    const hasActive = overview.data?.items.some(
      (item) =>
        item.status === 'in_progress' &&
        item.tags.some((name) => name.toLowerCase() === tag.name.toLowerCase()),
    );
    if (hasActive) {
      toast.add({ title: '当前标签存在未完成待办，无法归档删除。', type: 'error' });
      return;
    }
    archiveDeleteMutation.reset();
    setArchivingTag(tag);
  };
  const exportMutation = useMutation({
    mutationFn: ({ path, tagId }: { path: string; tagId: number }) => exportTodosApi(path, tagId),
    onError: reportError,
  });
  const handleExportTag = async (tag: TodoTag) => {
    if (exportMutation.isPending) return;
    const defaultPath = `${todayDate()}-待办-${tag.name}.md`;
    const selected = await save({
      defaultPath,
      filters: [{ name: 'Markdown', extensions: ['md'] }],
    });
    if (!selected) return;
    try {
      const saved = await exportMutation.mutateAsync({ path: selected, tagId: tag.id });
      toast.add({ type: 'success', title: '导出成功', description: saved });
    } catch {
      /* toast is handled by mutation */
    }
  };

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
    <div className="flex min-h-0 flex-1 overflow-hidden">
      <TodoSidebar
        tags={tags.data ?? []}
        total={overview.data?.total ?? 0}
        selectedTagId={tagId}
        onSelectTag={setTagId}
        onExportTag={handleExportTag}
        onRenameTag={(tag) => {
          setRenaming(tag);
          setRenameValue(tag.name);
        }}
        onDeleteTag={(tag) => {
          deleteTagMutation.reset();
          setDeletingTag(tag);
        }}
        onArchiveDeleteTag={handleArchiveDeleteTag}
      />

      <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-background">
        <header className="flex items-center justify-between px-8 py-5">
          <h1 className="text-2xl font-semibold">{selectedTag?.name ?? '所有任务'}</h1>
          <Button
            onClick={() => {
              setEditing(null);
              setDialogOpen(true);
            }}
          >
            <Plus data-icon="inline-start" />
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
                  tags: selectedTag ? [selectedTag.name] : [],
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
          onValueChange={(value) => setStatus(value as StatusFilter)}
          className="px-8 pb-3"
        >
          <TabsList variant="line">
            {STATUS_TABS.map((tab) => (
              <TabsTrigger key={tab.value} value={tab.value}>
                {tab.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        <Separator />

        <div className="min-h-0 flex-1 overflow-y-auto px-8 py-4">
          {todos.isLoading ? (
            <div
              role="status"
              className="flex items-center justify-center gap-2 py-10 text-muted-foreground"
            >
              <Spinner />
              正在加载任务…
            </div>
          ) : todos.isError ? (
            <Alert variant="destructive" className="mx-auto max-w-md text-center">
              <AlertTitle>任务加载失败</AlertTitle>
            </Alert>
          ) : todos.data?.items.length === 0 ? (
            <Empty className="py-10">
              <EmptyDescription>{emptyText}</EmptyDescription>
            </Empty>
          ) : (
            <div className="flex flex-col gap-1">
              {todos.data?.items.map((todo) => (
                <TodoListItem
                  key={todo.id}
                  todo={todo}
                  tags={tags.data ?? []}
                  statusPending={statusMutation.isPending}
                  deletePending={deleteMutation.isPending}
                  deleteError={deleteMutation.error}
                  onEdit={(item) => {
                    setEditing(item);
                    setDialogOpen(true);
                  }}
                  onSelectTag={setTagId}
                  onSetStatus={(id, next) => statusMutation.mutate({ id, next })}
                  onPrepareDelete={() => deleteMutation.reset()}
                  onDelete={(id) => deleteMutation.mutateAsync(id)}
                />
              ))}
            </div>
          )}
        </div>
        <Separator />
        <footer className="mt-auto shrink-0 bg-background px-8 py-2 text-sm text-muted-foreground">
          {todos.data?.total ?? 0} 个任务 · {todos.data?.completed ?? 0} 个已完成
        </footer>
      </main>

      <TodoDialog
        open={dialogOpen}
        todo={editing}
        availableTags={tags.data ?? []}
        defaultTag={selectedTag?.name}
        onOpenChange={setDialogOpen}
        onSave={saveDialog}
      />

      <TodoTagDialogs
        renaming={renaming}
        renameValue={renameValue}
        renamePending={renameMutation.isPending}
        deleting={deletingTag}
        deletePending={deleteTagMutation.isPending}
        deleteError={deleteTagMutation.error}
        archiving={archivingTag}
        archivePending={archiveDeleteMutation.isPending}
        archiveError={archiveDeleteMutation.error}
        onRenameValueChange={setRenameValue}
        onCloseRename={() => setRenaming(null)}
        onRename={async () => {
          if (!renaming) return;
          try {
            await renameMutation.mutateAsync({ id: renaming.id, name: renameValue });
            setRenaming(null);
          } catch {
            /* toast handled */
          }
        }}
        onCloseDelete={() => setDeletingTag(null)}
        onDelete={async () => {
          if (!deletingTag) return;
          try {
            await deleteTagMutation.mutateAsync(deletingTag.id);
            setDeletingTag(null);
          } catch {
            /* toast handled */
          }
        }}
        onCloseArchive={() => setArchivingTag(null)}
        onArchive={async () => {
          if (!archivingTag) return;
          try {
            await archiveDeleteMutation.mutateAsync(archivingTag.id);
            setArchivingTag(null);
          } catch {
            /* toast handled */
          }
        }}
      />
    </div>
  );
}
