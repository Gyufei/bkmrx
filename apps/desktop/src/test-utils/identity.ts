import type { BookmarkId, RssEntryId, RssFeedId, TodoId, TodoTagId } from '@/identity';
import type { NavigationCategoryId, NavigationPlacementId } from '@/identity';

function entityUuid(sequence: number) {
  const suffix = sequence.toString(16).padStart(12, '0');
  return `018f0000-0000-7000-8000-${suffix}`;
}

export function bookmarkId(sequence: number): BookmarkId {
  return entityUuid(sequence) as BookmarkId;
}

export function todoId(sequence: number): TodoId {
  return entityUuid(sequence) as TodoId;
}

export function todoTagId(sequence: number): TodoTagId {
  return entityUuid(sequence) as TodoTagId;
}

export function rssFeedId(sequence: number): RssFeedId {
  return entityUuid(sequence) as RssFeedId;
}

export function rssEntryId(sequence: number): RssEntryId {
  return entityUuid(sequence) as RssEntryId;
}

export function navigationCategoryId(sequence: number): NavigationCategoryId {
  return entityUuid(sequence) as NavigationCategoryId;
}

export function navigationPlacementId(sequence: number): NavigationPlacementId {
  return entityUuid(sequence) as NavigationPlacementId;
}
