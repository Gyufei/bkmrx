export interface Bookmark {
  id: number;
  url: string;
  title: string;
  description: string;
  tags: string[];
  access_count: number;
  created_at: string;
  updated_at: string;
  accessed_at: string | null;
  starred_at: string | null;
}

export interface PrepareBookmarkPreviewRequest {
  bookmark_id: number;
  url: string;
}

export interface GithubRepositoryPreview {
  owner: string;
  name: string;
  full_name: string;
  description: string | null;
  html_url: string;
  owner_avatar_url: string | null;
  primary_language: string | null;
  stars: number;
  forks: number;
  topics: string[];
  default_branch: string;
  updated_at: string;
}

export type PreviewFallbackReason =
  | 'embedding_denied'
  | 'timeout'
  | 'dns_failure'
  | 'connection_failure'
  | 'http_error'
  | 'unsupported_protocol'
  | 'unsupported_provider_url'
  | 'provider_rate_limited'
  | 'provider_not_found'
  | 'provider_error'
  | 'unsafe_target';

export type BookmarkPreview =
  | { kind: 'web'; url: string; final_url: string }
  | { kind: 'github_repository'; url: string; repository: GithubRepositoryPreview }
  | {
      kind: 'fallback';
      url: string;
      reason: PreviewFallbackReason;
      message: string;
      http_status: number | null;
    };

export interface Tag {
  name: string;
  count: number;
}

export interface TagQueryRequest {
  query: string;
  limit: number | null;
}

export type BookmarkBaseView = 'all' | 'starred';

export interface BookmarkPageRequest {
  query: string;
  tags: string[];
  cursor: string | null;
  page_size: number;
  starred_only: boolean;
}

export interface BookmarkPage {
  items: Bookmark[];
  next_cursor: string | null;
}

export interface CreateBookmark {
  url: string;
  title: string;
  description: string;
  tags: string[];
}

export interface UpdateBookmark {
  url?: string;
  title?: string;
  description?: string;
  tags?: string[];
}

export interface AppError {
  code: string;
  message: string;
  details: unknown | null;
}

export interface ImportPreview {
  file_hash: string;
  total: number;
  create_count: number;
  update_count: number;
  skip_count: number;
}

export interface NoteFile {
  path: string;
  relative_path: string;
  title: string;
  tags: string[];
  modified: number;
  size: number;
}

export type TodoStatus = 'in_progress' | 'completed' | 'suspended' | 'canceled';

export interface Todo {
  id: number;
  title: string;
  description: string;
  status: TodoStatus;
  is_high_priority: boolean;
  tags: string[];
  created_at: string;
  updated_at: string;
  completed_at: string | null;
}

export interface TodoTag {
  id: number;
  name: string;
  count: number;
}

export interface TodoQuery {
  status: TodoStatus | null;
  tag_id: number | null;
}

export interface TodoList {
  items: Todo[];
  total: number;
  completed: number;
}

export interface CreateTodo {
  title: string;
  description: string;
  is_high_priority: boolean;
  tags: string[];
}

export type UpdateTodo = CreateTodo;
