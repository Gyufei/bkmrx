import { describe, expect, it } from 'vitest';
import { hasErrorCode } from './error';

describe('hasErrorCode', () => {
  it('matches only structured errors with the requested code', () => {
    expect(hasErrorCode({ code: 'bookmark_url_conflict' }, 'bookmark_url_conflict')).toBe(true);
    expect(
      hasErrorCode(
        { code: 'database_error', message: 'bookmark_url_conflict' },
        'bookmark_url_conflict',
      ),
    ).toBe(false);
    expect(hasErrorCode(new Error('bookmark_url_conflict'), 'bookmark_url_conflict')).toBe(false);
  });
});
