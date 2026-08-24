import { describe, expect, it } from 'vitest';
import { formatPathForDisplay } from './path';

describe('formatPathForDisplay', () => {
  it('returns short paths unchanged', () => {
    expect(formatPathForDisplay('/tmp/export.md')).toBe('/tmp/export.md');
    expect(formatPathForDisplay('notes/vault/main.md')).toBe('notes/vault/main.md');
  });

  it('collapses long paths to the first and last three segments', () => {
    const input = '/Users/me/CloudDrive/projects/archive/bookmarks/backup';
    expect(formatPathForDisplay(input)).toBe('/Users/me/CloudDrive/…/archive/bookmarks/backup');
  });

  it('handles Windows backslash separators', () => {
    const input = 'C:\\Users\\me\\Projects\\Archive\\Bookmarks\\Backup';
    expect(formatPathForDisplay(input)).toBe('C:\\Users\\me\\…\\Archive\\Bookmarks\\Backup');
  });
});
