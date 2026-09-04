import type { RssEntry } from '@/types';
import type { BookmarkFormValues } from '@/bookmarks/BookmarkForm';

export function rssEntryToBookmarkValues(entry: RssEntry): BookmarkFormValues {
  return {
    url: entry.link?.trim() ?? '',
    title: entry.title,
    tags: [],
    description: htmlToPlainText(entry.summary),
  };
}

function htmlToPlainText(value: string): string {
  if (!value.trim()) return '';
  const document = new DOMParser().parseFromString(value, 'text/html');
  return (document.body.textContent ?? '').replace(/\s+/g, ' ').trim();
}
