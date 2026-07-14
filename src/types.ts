export interface Bookmark {
  id: number;
  url: string;
  title: string;
  tags: string[];
  description?: string;
  modified?: string;
}

export interface Tag {
  name: string;
  count: number;
}

export interface NoteFile {
  path: string;
  relative_path: string;
  title: string;
  tags: string[];
  modified: number;
  size: number;
}
