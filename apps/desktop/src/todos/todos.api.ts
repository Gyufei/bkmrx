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
export const updateTodoApi = (id: number, input: UpdateTodo) => invokeUpdateTodo(id, input);
export const setTodoStatusApi = (id: number, status: TodoStatus) => invokeSetTodoStatus(id, status);
export const deleteTodoApi = (id: number) => invokeDeleteTodo(id);
export const renameTodoTagApi = (id: number, name: string) => invokeRenameTodoTag(id, name);
export const deleteTodoTagApi = (id: number) => invokeDeleteTodoTag(id);
export const archiveDeleteTodoTagApi = (id: number) => invokeArchiveDeleteTodoTag(id);
export const exportTodosApi = (path: string, tagId: number) => invokeExportTodos(path, tagId);
