import { useCallback, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from '@/components/ui/toast';
import { getErrorMessage } from '@/lib/error';
import { useTauriEvent } from '@/lib/use-tauri-event';
import type { CreateTodo, Todo, TodoStatus } from '@/types';
import {
  createTodoApi,
  deleteTodoApi,
  deleteTodoTagApi,
  getTodoTagsApi,
  invalidateTodoQueries,
  queryTodosApi,
  renameTodoTagApi,
  setTodoStatusApi,
  TODO_TAGS_QUERY_KEY,
  todoQueryKey,
  updateTodoApi,
} from './todos.api';
import { useArchiveDeleteTag } from './use-archive-delete-tag';
import { useTodoExport } from './use-todo-export';

export type StatusFilter = TodoStatus | 'all';

export const STATUS_TABS: Array<{ value: StatusFilter; label: string }> = [
  { value: 'all', label: '全部' },
  { value: 'in_progress', label: '进行中' },
  { value: 'completed', label: '已完成' },
  { value: 'suspended', label: '挂起' },
  { value: 'canceled', label: '已取消' },
];

export function useTodoController() {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<StatusFilter>('all');
  const [tagId, setTagId] = useState<number | null>(null);
  const request = useMemo(
    () => ({ status: status === 'all' ? null : status, tag_id: tagId }),
    [status, tagId],
  );
  const todos = useQuery({
    queryKey: todoQueryKey(request),
    queryFn: () => queryTodosApi(request),
  });
  const overviewRequest = useMemo(() => ({ status: null, tag_id: null }), []);
  const overview = useQuery({
    queryKey: todoQueryKey(overviewRequest),
    queryFn: () => queryTodosApi(overviewRequest),
  });
  const tags = useQuery({ queryKey: TODO_TAGS_QUERY_KEY, queryFn: getTodoTagsApi });
  const invalidate = useCallback(() => invalidateTodoQueries(queryClient), [queryClient]);
  useTauriEvent('todos-changed', invalidate);
  const reportError = useCallback((error: unknown) => {
    toast.add({ title: getErrorMessage(error, 'Todo 操作失败'), type: 'error' });
  }, []);
  const createMutation = useMutation({
    mutationFn: createTodoApi,
    onError: reportError,
  });
  const updateMutation = useMutation({
    mutationFn: ({ id, input }: { id: number; input: CreateTodo }) => updateTodoApi(id, input),
    onError: reportError,
  });
  const statusMutation = useMutation({
    mutationFn: ({ id, next }: { id: number; next: TodoStatus }) => setTodoStatusApi(id, next),
    onError: reportError,
  });
  const deleteMutation = useMutation({
    mutationFn: deleteTodoApi,
    onError: reportError,
  });
  const renameMutation = useMutation({
    mutationFn: ({ id, name }: { id: number; name: string }) => renameTodoTagApi(id, name),
    onSuccess: (tag, variables) => {
      setTagId((current) => (current === variables.id ? tag.id : current));
    },
    onError: reportError,
  });
  const deleteTagMutation = useMutation({
    mutationFn: deleteTodoTagApi,
    onSuccess: (_result, deletedId) => {
      setTagId((current) => (current === deletedId ? null : current));
    },
    onError: reportError,
  });
  const { exportTag } = useTodoExport(reportError);
  const archiveDelete = useArchiveDeleteTag({
    items: overview.data?.items,
    onDeleted: (deletedId) => setTagId((current) => (current === deletedId ? null : current)),
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
  const saveTodo = (editing: Todo | null, input: CreateTodo) =>
    editing
      ? updateMutation.mutateAsync({ id: editing.id, input })
      : createMutation.mutateAsync(input);
  return {
    status,
    setStatus,
    tagId,
    setTagId,
    todos,
    overview,
    tags,
    selectedTag,
    emptyText,
    createMutation,
    statusMutation,
    deleteMutation,
    renameMutation,
    deleteTagMutation,
    archiveDelete,
    exportTag,
    saveTodo,
  };
}
