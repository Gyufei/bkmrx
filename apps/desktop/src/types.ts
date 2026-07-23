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
}

export interface Tag {
  name: string;
  count: number;
}

export interface BookmarkPageRequest {
  query: string;
  tags: string[];
  cursor: string | null;
  page_size: number;
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
