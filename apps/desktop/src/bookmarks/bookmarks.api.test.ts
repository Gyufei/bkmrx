import { describe, expect, it } from 'vitest';

import {
  bookmarkQueryKey,
  getNextBookmarkPageParam,
} from './bookmarks.api';

describe('bookmark pagination helpers', () => {
  it('builds a stable key with sorted tags', () => {
    expect(bookmarkQueryKey('中文', ['z', 'a'], 50)).toEqual([
      'bookmarks',
      '中文',
      ['a', 'z'],
      50,
    ]);
  });

  it('returns only real next cursors', () => {
    expect(getNextBookmarkPageParam({ items: [], next_cursor: 'abc' })).toBe('abc');
    expect(getNextBookmarkPageParam({ items: [], next_cursor: null })).toBeUndefined();
  });
});
