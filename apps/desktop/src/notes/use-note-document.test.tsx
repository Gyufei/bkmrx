// @vitest-environment jsdom

import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useNoteDocument } from './use-note-document';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('useNoteDocument reads', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('loads and strips the current note', async () => {
    const read = vi.fn().mockResolvedValue('---\ntitle: A\n---\n# A');
    const save = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => useNoteDocument('/a.md', { read, save, debounceMs: 400 }));

    await vi.waitFor(() => expect(result.current.loadState).toBe('ready'));
    expect(result.current.content).toBe('# A');
    expect(result.current.dirty).toBe(false);
  });

  it('ignores a late read from the previous path', async () => {
    const a = deferred<string>();
    const b = deferred<string>();
    const read = vi.fn((path: string) => (path === '/a.md' ? a.promise : b.promise));
    const save = vi.fn().mockResolvedValue(undefined);
    const { result, rerender } = renderHook(
      ({ path }) => useNoteDocument(path, { read, save, debounceMs: 400 }),
      { initialProps: { path: '/a.md' } },
    );

    rerender({ path: '/b.md' });
    b.resolve('# B');
    await vi.waitFor(() => expect(result.current.content).toBe('# B'));
    a.resolve('# A');
    await act(async () => {
      await Promise.resolve();
    });

    expect(result.current.content).toBe('# B');
  });
});

describe('useNoteDocument saves', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('debounces changes and saves only the latest captured content', async () => {
    const read = vi.fn().mockResolvedValue('start');
    const save = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => useNoteDocument('/a.md', { read, save, debounceMs: 400 }));
    await vi.waitFor(() => expect(result.current.loadState).toBe('ready'));

    act(() => {
      result.current.setContent('first');
      result.current.setContent('second');
      vi.advanceTimersByTime(399);
    });
    expect(save).not.toHaveBeenCalled();

    await act(async () => {
      vi.advanceTimersByTime(1);
      await Promise.resolve();
    });
    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith('/a.md', 'second');
  });

  it('saves an empty document', async () => {
    const read = vi.fn().mockResolvedValue('not empty');
    const save = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => useNoteDocument('/a.md', { read, save, debounceMs: 400 }));
    await vi.waitFor(() => expect(result.current.loadState).toBe('ready'));

    act(() => result.current.setContent(''));
    await act(async () => {
      await result.current.flush();
    });

    expect(save).toHaveBeenCalledWith('/a.md', '');
    expect(result.current.dirty).toBe(false);
  });

  it('keeps failed content in memory and dirty for retry', async () => {
    const read = vi.fn().mockResolvedValue('start');
    const save = vi.fn().mockRejectedValue(new Error('disk full'));
    const { result } = renderHook(() => useNoteDocument('/a.md', { read, save, debounceMs: 400 }));
    await vi.waitFor(() => expect(result.current.loadState).toBe('ready'));

    act(() => result.current.setContent('draft'));
    await act(async () => {
      await result.current.flush().catch(() => undefined);
    });

    expect(result.current.content).toBe('draft');
    expect(result.current.dirty).toBe(true);
    expect(result.current.saveError).toMatchObject({
      path: '/a.md',
      content: 'draft',
      error: new Error('disk full'),
    });
  });

  it('does not mark a newer edit saved when an older save completes', async () => {
    const first = deferred<void>();
    const read = vi.fn().mockResolvedValue('start');
    const save = vi.fn().mockReturnValue(first.promise);
    const { result } = renderHook(() => useNoteDocument('/a.md', { read, save, debounceMs: 400 }));
    await vi.waitFor(() => expect(result.current.loadState).toBe('ready'));

    act(() => {
      result.current.setContent('old');
      vi.advanceTimersByTime(400);
    });
    expect(save).toHaveBeenCalledWith('/a.md', 'old');

    act(() => result.current.setContent('new'));
    await act(async () => {
      first.resolve();
      await Promise.resolve();
    });

    expect(result.current.dirty).toBe(true);
    expect(result.current.saveState).not.toBe('saved');
  });
});

describe('useNoteDocument file changes and failures', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('submits the captured old-path snapshot immediately when the file changes', async () => {
    const b = deferred<string>();
    const read = vi.fn((path: string) => (path === '/a.md' ? Promise.resolve('start') : b.promise));
    const save = vi.fn().mockResolvedValue(undefined);
    const { result, rerender } = renderHook(
      ({ path }) => useNoteDocument(path, { read, save, debounceMs: 400 }),
      { initialProps: { path: '/a.md' } },
    );
    await vi.waitFor(() => expect(result.current.loadState).toBe('ready'));

    act(() => result.current.setContent('old content'));
    rerender({ path: '/b.md' });

    expect(save).toHaveBeenCalledWith('/a.md', 'old content');
    expect(result.current.loadState).toBe('loading');
  });

  it('preserves and retries a failed old-path snapshot while the next file loads', async () => {
    const b = deferred<string>();
    const failedWrite = deferred<void>();
    const read = vi.fn((path: string) => (path === '/a.md' ? Promise.resolve('start') : b.promise));
    const save = vi.fn().mockReturnValueOnce(failedWrite.promise).mockResolvedValue(undefined);
    const { result, rerender } = renderHook(
      ({ path }) => useNoteDocument(path, { read, save, debounceMs: 400 }),
      { initialProps: { path: '/a.md' } },
    );
    await vi.waitFor(() => expect(result.current.loadState).toBe('ready'));

    act(() => result.current.setContent('old content'));
    rerender({ path: '/b.md' });
    failedWrite.reject(new Error('disk full'));
    await vi.waitFor(() => expect(result.current.saveError?.path).toBe('/a.md'));

    expect(result.current.saveError?.content).toBe('old content');
    expect(result.current.loadState).toBe('loading');
    await act(async () => {
      await result.current.retrySave();
    });

    expect(save).toHaveBeenLastCalledWith('/a.md', 'old content');
    expect(result.current.saveError).toBe(null);
  });

  it('retries a failed read', async () => {
    const read = vi
      .fn<(path: string) => Promise<string>>()
      .mockRejectedValueOnce(new Error('missing'))
      .mockResolvedValueOnce('# recovered');
    const save = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => useNoteDocument('/a.md', { read, save, debounceMs: 400 }));
    await vi.waitFor(() => expect(result.current.loadState).toBe('error'));

    await act(async () => {
      await result.current.retryRead();
    });

    expect(result.current.loadState).toBe('ready');
    expect(result.current.content).toBe('# recovered');
  });

  it('clears a pending debounce when unmounted', async () => {
    const read = vi.fn().mockResolvedValue('start');
    const save = vi.fn().mockRejectedValue(new Error('disk full'));
    const { result, unmount } = renderHook(() =>
      useNoteDocument('/a.md', { read, save, debounceMs: 400 }),
    );
    await vi.waitFor(() => expect(result.current.loadState).toBe('ready'));

    act(() => result.current.setContent('draft'));
    unmount();
    await act(async () => {
      vi.advanceTimersByTime(400);
      await Promise.resolve();
    });

    expect(save).not.toHaveBeenCalled();
  });
});

describe('useNoteDocument save races', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('flushes an edit from the active retry-read session before changing files', async () => {
    const b = deferred<string>();
    const read = vi
      .fn<(path: string) => Promise<string>>()
      .mockRejectedValueOnce(new Error('missing'))
      .mockResolvedValueOnce('recovered')
      .mockReturnValueOnce(b.promise);
    const save = vi.fn().mockResolvedValue(undefined);
    const { result, rerender } = renderHook(
      ({ path }) => useNoteDocument(path, { read, save, debounceMs: 400 }),
      { initialProps: { path: '/a.md' } },
    );
    await vi.waitFor(() => expect(result.current.loadState).toBe('error'));

    await act(async () => {
      await result.current.retryRead();
    });
    act(() => result.current.setContent('draft after retry'));
    rerender({ path: '/b.md' });

    expect(save).toHaveBeenCalledWith('/a.md', 'draft after retry');
  });

  it('retires an older failed snapshot after a newer version saves', async () => {
    const read = vi.fn().mockResolvedValue('start');
    const save = vi
      .fn<(path: string, content: string) => Promise<void>>()
      .mockRejectedValueOnce(new Error('v1 failed'))
      .mockResolvedValueOnce();
    const { result } = renderHook(() => useNoteDocument('/a.md', { read, save, debounceMs: 400 }));
    await vi.waitFor(() => expect(result.current.loadState).toBe('ready'));

    act(() => result.current.setContent('v1'));
    await act(async () => {
      await result.current.flush().catch(() => undefined);
    });
    await vi.waitFor(() => expect(result.current.saveError?.content).toBe('v1'));

    act(() => result.current.setContent('v2'));
    await act(async () => {
      await result.current.flush();
    });

    expect(result.current.saveError).toBe(null);
    await act(async () => {
      await result.current.retrySave();
    });
    expect(save).toHaveBeenCalledTimes(2);
  });

  it('propagates explicit flush and retry rejections', async () => {
    const read = vi.fn().mockResolvedValue('start');
    const save = vi
      .fn<(path: string, content: string) => Promise<void>>()
      .mockRejectedValueOnce(new Error('flush failed'))
      .mockRejectedValueOnce(new Error('retry failed'));
    const { result } = renderHook(() => useNoteDocument('/a.md', { read, save, debounceMs: 400 }));
    await vi.waitFor(() => expect(result.current.loadState).toBe('ready'));

    act(() => result.current.setContent('draft'));
    await expect(result.current.flush()).rejects.toThrow('flush failed');
    await vi.waitFor(() => expect(result.current.saveError?.content).toBe('draft'));

    await expect(result.current.retrySave()).rejects.toThrow('retry failed');
  });

  it('reuses one in-flight retry for the same failed snapshot', async () => {
    const retry = deferred<void>();
    const read = vi.fn().mockResolvedValue('start');
    const save = vi
      .fn<(path: string, content: string) => Promise<void>>()
      .mockRejectedValueOnce(new Error('disk full'))
      .mockReturnValueOnce(retry.promise)
      .mockResolvedValue(undefined);
    const { result } = renderHook(() => useNoteDocument('/a.md', { read, save, debounceMs: 400 }));
    await vi.waitFor(() => expect(result.current.loadState).toBe('ready'));

    act(() => result.current.setContent('draft'));
    await act(async () => {
      await result.current.flush().catch(() => undefined);
    });
    await vi.waitFor(() => expect(result.current.saveError?.content).toBe('draft'));

    const firstRetry = result.current.retrySave();
    const secondRetry = result.current.retrySave();
    expect(save).toHaveBeenCalledTimes(2);

    retry.resolve();
    await expect(firstRetry).resolves.toBeUndefined();
    await expect(secondRetry).resolves.toBeUndefined();
  });

  it('waits for an already submitted version instead of writing it twice', async () => {
    const firstWrite = deferred<void>();
    const read = vi.fn().mockResolvedValue('start');
    const save = vi.fn().mockReturnValue(firstWrite.promise);
    const { result } = renderHook(() => useNoteDocument('/a.md', { read, save, debounceMs: 400 }));
    await vi.waitFor(() => expect(result.current.loadState).toBe('ready'));

    act(() => {
      result.current.setContent('draft');
      vi.advanceTimersByTime(400);
    });
    const flush = result.current.flush();
    expect(save).toHaveBeenCalledTimes(1);

    firstWrite.resolve();
    await expect(flush).resolves.toBeUndefined();
  });

  it('ignores a late failed first save after the second version succeeds', async () => {
    const firstWrite = deferred<void>();
    const secondWrite = deferred<void>();
    const read = vi.fn().mockResolvedValue('start');
    const save = vi
      .fn<(path: string, content: string) => Promise<void>>()
      .mockReturnValueOnce(firstWrite.promise)
      .mockReturnValueOnce(secondWrite.promise);
    const { result } = renderHook(() => useNoteDocument('/a.md', { read, save, debounceMs: 400 }));
    await vi.waitFor(() => expect(result.current.loadState).toBe('ready'));

    act(() => result.current.setContent('v1'));
    const first = result.current.flush();
    act(() => result.current.setContent('v2'));
    const second = result.current.flush();
    expect(save).toHaveBeenNthCalledWith(1, '/a.md', 'v1');
    expect(save).toHaveBeenNthCalledWith(2, '/a.md', 'v2');

    await act(async () => {
      secondWrite.resolve();
      await expect(second).resolves.toBeUndefined();
    });
    await act(async () => {
      firstWrite.reject(new Error('v1 failed late'));
      await expect(first).rejects.toThrow('v1 failed late');
    });

    expect(result.current.dirty).toBe(false);
    expect(result.current.saveState).toBe('saved');
    expect(result.current.saveError).toBe(null);
  });

  it('contains a failed submitted write after unmount without console fallback', async () => {
    const write = deferred<void>();
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const read = vi.fn().mockResolvedValue('start');
    const save = vi.fn().mockReturnValue(write.promise);
    const { result, unmount } = renderHook(() =>
      useNoteDocument('/a.md', { read, save, debounceMs: 400 }),
    );
    await vi.waitFor(() => expect(result.current.loadState).toBe('ready'));

    act(() => {
      result.current.setContent('draft');
      vi.advanceTimersByTime(400);
    });
    unmount();
    write.reject(new Error('disk full'));
    await act(async () => {
      await Promise.resolve();
    });

    expect(consoleError).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });
});
