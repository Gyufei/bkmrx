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

export type BookmarkBaseView = 'all' | 'starred' | 'random';

export type BookmarkPageRequest =
  | {
      mode: 'browse';
      starred: boolean;
      cursor: string | null;
      page_size: number;
    }
  | {
      mode: 'search';
      query: string;
      tags: string[];
      cursor: string | null;
      page_size: number;
    }
  | {
      mode: 'random';
      limit: number;
    };

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

export interface RssFeed {
  id: number;
  source_url: string;
  feed_url: string;
  site_url: string | null;
  title: string;
  custom_title: string | null;
  entry_count: number;
  unread_count: number;
  last_successful_fetched_at: number | null;
  last_failed_at: number | null;
  last_error: string | null;
  created_at: number;
  updated_at: number;
}

export interface RssEntry {
  id: number;
  feed_id: number;
  feed_title: string;
  title: string;
  link: string | null;
  author: string | null;
  content_html: string;
  summary: string;
  published_at: number | null;
  fetched_at: number;
  is_read: boolean;
}

export type RssEntryScope =
  { mode: 'all' } | { mode: 'unread' } | { mode: 'feed'; feed_id: number };
export interface RssEntryPage {
  entries: RssEntry[];
  next_cursor: string | null;
}
export interface FeedCandidate {
  title: string | null;
  feed_url: string;
  site_url: string | null;
  recent_entries: FeedPreviewEntry[];
}
export interface FeedPreviewEntry {
  title: string;
  published_at: number | null;
}
export interface FeedPreview {
  source_url: string;
  candidates: FeedCandidate[];
}
export interface FeedRefreshResult {
  feed: RssFeed;
  added: number;
}
export interface RefreshResult {
  refreshed: number;
  added: number;
  failed: number;
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
