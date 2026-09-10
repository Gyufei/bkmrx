import { beforeEach, describe, expect, it, vi } from 'vitest';
import { bookmarkId } from '@/test-utils/identity';
import { openBookmark } from './open-bookmark';

const mocks = vi.hoisted(() => ({ open: vi.fn(), record: vi.fn() }));
vi.mock('@tauri-apps/plugin-shell', () => ({ open: mocks.open }));
vi.mock('@/lib/invoke', () => ({ invokeRecordBookmarkAccess: mocks.record }));

describe('openBookmark', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.open.mockResolvedValue(undefined);
    mocks.record.mockResolvedValue(undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  it('records access only after the system browser opens', async () => {
    await openBookmark({ id: bookmarkId(1), url: 'https://example.com' });
    expect(mocks.open).toHaveBeenCalledWith('https://example.com');
    expect(mocks.record).toHaveBeenCalledWith(bookmarkId(1));
    expect(mocks.open.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.record.mock.invocationCallOrder[0],
    );
  });

  it('does not record access when opening fails', async () => {
    mocks.open.mockRejectedValue(new Error('open failed'));
    await expect(openBookmark({ id: bookmarkId(1), url: 'https://example.com' })).rejects.toThrow(
      'open failed',
    );
    expect(mocks.record).not.toHaveBeenCalled();
    expect(console.error).toHaveBeenCalledWith(
      'bookmark_operation_failed',
      expect.objectContaining({ operation: 'open', bookmarkId: bookmarkId(1), errorType: 'Error' }),
    );
  });

  it('keeps a successful open successful when access recording fails', async () => {
    mocks.record.mockRejectedValue(new TypeError('record failed'));
    await expect(
      openBookmark({ id: bookmarkId(1), url: 'https://example.com' }),
    ).resolves.toBeUndefined();
    expect(console.error).toHaveBeenCalledWith(
      'bookmark_operation_failed',
      expect.objectContaining({
        operation: 'record_access',
        bookmarkId: bookmarkId(1),
        errorType: 'TypeError',
      }),
    );
  });
});
