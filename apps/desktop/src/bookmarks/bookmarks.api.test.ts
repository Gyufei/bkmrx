import { describe, expect, it } from 'vitest';

import { bookmarkQueryKey, getNextBookmarkPageParam, tagQueryKey } from './bookmarks.api';

describe('bookmark pagination helpers', () => {
  it('builds a stable key with sorted tags', () => {
    expect(bookmarkQueryKey('中文', ['z', 'a'], 50)).toEqual([
      'bookmarks',
      '中文',
      ['a', 'z'],
      50,
      false,
    ]);
  });

  it('returns only real next cursors', () => {
    expect(getNextBookmarkPageParam({ items: [], next_cursor: 'abc' })).toBe('abc');
    expect(getNextBookmarkPageParam({ items: [], next_cursor: null })).toBeUndefined();
  });

  it('builds a normalized tag query key', () => {
    expect(tagQueryKey('  rust  ', 50)).toEqual(['tags', 'rust', 50]);
    expect(tagQueryKey('', null)).toEqual(['tags', '', null]);
  });
});
