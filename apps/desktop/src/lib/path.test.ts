import { describe, expect, it } from 'vitest';
import { formatPathForDisplay, joinDirectoryAndFilename, sanitizeFilenameSegment } from './path';

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

describe('joinDirectoryAndFilename', () => {
  it('falls back to the filename without a configured directory', () => {
    expect(joinDirectoryAndFilename(null, 'todos.md')).toBe('todos.md');
    expect(joinDirectoryAndFilename('  ', 'todos.md')).toBe('todos.md');
  });

  it('joins posix and Windows-style directories without duplicate separators', () => {
    expect(joinDirectoryAndFilename('/tmp/exports/', 'todos.md')).toBe('/tmp/exports/todos.md');
    expect(joinDirectoryAndFilename('C:\\Exports', 'todos.md')).toBe('C:\\Exports\\todos.md');
  });
});

describe('sanitizeFilenameSegment', () => {
  it('replaces path separators and reserved filename characters', () => {
    expect(sanitizeFilenameSegment('工作/项目:第一期\\草稿')).toBe('工作-项目-第一期-草稿');
  });

  it('falls back when no usable filename content remains', () => {
    expect(sanitizeFilenameSegment('///')).toBe('未命名');
  });
});
