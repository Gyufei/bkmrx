import { describe, expect, it } from 'vitest';
import { QueryClient, type InfiniteData } from '@tanstack/react-query';

import type { Bookmark, BookmarkPage } from '@/types';
import {
  bookmarkByUrlQueryKey,
  bookmarkQueryKey,
  getNextBookmarkPageParam,
  removeRandomBookmarksFromQuery,
  tagQueryKey,
  updateBookmarkAccessQueries,
  updateRandomBookmarkQuery,
} from './bookmarks.api';

describe('bookmark pagination helpers', () => {
  it('builds a stable key with sorted tags', () => {
    expect(
      bookmarkQueryKey({
        mode: 'search',
        query: ' 中文 ',
        tags: ['z', 'a'],
        cursor: null,
        page_size: 50,
      }),
    ).toEqual([
      'bookmarks',
      { mode: 'search', query: '中文', tags: ['a', 'z'], cursor: null, page_size: 50 },
      0,
    ]);
  });

  it('includes the draw id only for random requests', () => {
    expect(bookmarkQueryKey({ mode: 'random', limit: 7 }, 3)).toEqual([
      'bookmarks',
      { mode: 'random', limit: 7 },
      3,
    ]);
    expect(
      bookmarkQueryKey({ mode: 'browse', starred: false, cursor: null, page_size: 50 }, 3)[2],
    ).toBe(0);
  });

  it('returns only real next cursors', () => {
    expect(getNextBookmarkPageParam({ items: [], next_cursor: 'abc' })).toBe('abc');
    expect(getNextBookmarkPageParam({ items: [], next_cursor: null })).toBeUndefined();
  });

  it('builds a normalized tag query key', () => {
    expect(tagQueryKey('  rust  ', 50)).toEqual(['tags', 'rust', 50]);
    expect(tagQueryKey('', null)).toEqual(['tags', '', null]);
  });

  it('builds a normalized bookmark URL query key in the shared bookmark namespace', () => {
    expect(bookmarkByUrlQueryKey('  https://example.com/post  ')).toEqual([
      'bookmarks',
      'by-url',
      'https://example.com/post',
    ]);
  });

  it('updates and removes random results without redrawing the batch', () => {
    const queryClient = new QueryClient();
    const key = bookmarkQueryKey({ mode: 'random', limit: 7 }, 1);
    const original = {
      id: 1,
      url: 'https://example.com',
      title: 'Original',
      description: '',
      tags: [],
      access_count: 0,
      created_at: '',
      updated_at: '',
      accessed_at: null,
      starred_at: null,
    } satisfies Bookmark;
    queryClient.setQueryData<InfiniteData<BookmarkPage>>(key, {
      pages: [{ items: [original], next_cursor: null }],
      pageParams: [null],
    });

    updateRandomBookmarkQuery(queryClient, { ...original, title: 'Updated' });
    expect(queryClient.getQueryData<InfiniteData<BookmarkPage>>(key)?.pages[0].items[0].title).toBe(
      'Updated',
    );

    removeRandomBookmarksFromQuery(queryClient, [1]);
    expect(queryClient.getQueryData<InfiniteData<BookmarkPage>>(key)?.pages[0].items).toEqual([]);
  });

  it('updates an accessed bookmark in every cached bookmark query', () => {
    const queryClient = new QueryClient();
    const browseKey = bookmarkQueryKey({
      mode: 'browse',
      starred: false,
      cursor: null,
      page_size: 50,
    });
    const randomKey = bookmarkQueryKey({ mode: 'random', limit: 7 }, 1);
    const original = {
      id: 1,
      url: 'https://example.com',
      title: 'Original',
      description: '',
      tags: [],
      access_count: 0,
      created_at: '',
      updated_at: '',
      accessed_at: null,
      starred_at: null,
    } satisfies Bookmark;
    const data = {
      pages: [{ items: [original], next_cursor: null }],
      pageParams: [null],
    } satisfies InfiniteData<BookmarkPage>;
    queryClient.setQueryData(browseKey, data);
    queryClient.setQueryData(randomKey, data);

    updateBookmarkAccessQueries(queryClient, {
      ...original,
      title: 'Stale title',
      access_count: 1,
      accessed_at: '2026-08-18T10:00:00Z',
    });

    expect(
      queryClient.getQueryData<InfiniteData<BookmarkPage>>(browseKey)?.pages[0].items[0]
        .access_count,
    ).toBe(1);
    expect(
      queryClient.getQueryData<InfiniteData<BookmarkPage>>(browseKey)?.pages[0].items[0].title,
    ).toBe('Original');
    expect(
      queryClient.getQueryData<InfiniteData<BookmarkPage>>(randomKey)?.pages[0].items[0]
        .access_count,
    ).toBe(1);
  });
});
