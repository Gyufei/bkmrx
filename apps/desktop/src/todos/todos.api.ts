import {
  invokeArchiveDeleteTodoTag,
  invokeCreateTodo,
  invokeDeleteTodo,
  invokeDeleteTodoTag,
  invokeExportTodos,
  invokeGetTodoTags,
  invokeQueryTodos,
  invokeRenameTodoTag,
  invokeSetTodoStatus,
  invokeUpdateTodo,
} from '@/lib/invoke';
import type { CreateTodo, TodoQuery, TodoStatus, UpdateTodo } from '@/types';
import type { TodoId, TodoTagId } from '@/identity';
import type { QueryClient } from '@tanstack/react-query';

export const TODO_QUERY_KEY = ['todos'] as const;
export const TODO_TAGS_QUERY_KEY = ['todo-tags'] as const;

export const todoQueryKey = (request: TodoQuery) => [...TODO_QUERY_KEY, request] as const;
export const invalidateTodoQueries = (queryClient: QueryClient) =>
  Promise.all([
    queryClient.invalidateQueries({ queryKey: TODO_QUERY_KEY }),
    queryClient.invalidateQueries({ queryKey: TODO_TAGS_QUERY_KEY }),
  ]).then(() => undefined);
export const queryTodosApi = (request: TodoQuery) => invokeQueryTodos(request);
export const getTodoTagsApi = () => invokeGetTodoTags();
export const createTodoApi = (input: CreateTodo) => invokeCreateTodo(input);
export const updateTodoApi = (id: TodoId, input: UpdateTodo) => invokeUpdateTodo(id, input);
export const setTodoStatusApi = (id: TodoId, status: TodoStatus) => invokeSetTodoStatus(id, status);
export const deleteTodoApi = (id: TodoId) => invokeDeleteTodo(id);
export const renameTodoTagApi = (id: TodoTagId, name: string) => invokeRenameTodoTag(id, name);
export const deleteTodoTagApi = (id: TodoTagId) => invokeDeleteTodoTag(id);
export const archiveDeleteTodoTagApi = (id: TodoTagId) => invokeArchiveDeleteTodoTag(id);
export const exportTodosApi = (path: string, tagId: TodoTagId) => invokeExportTodos(path, tagId);
