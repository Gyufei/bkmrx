// @vitest-environment jsdom

import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import type { Event, UnlistenFn } from '@tauri-apps/api/event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useTauriEvent } from './use-tauri-event';

const listenMock = vi.hoisted(() => vi.fn());

vi.mock('@tauri-apps/api/event', () => ({ listen: listenMock }));

function deferredListener() {
  let resolve: ((unlisten: UnlistenFn) => void) | undefined;
  let reject: ((error: unknown) => void) | undefined;
  const promise = new Promise<UnlistenFn>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve: resolve!, reject: reject! };
}

describe('useTauriEvent', () => {
  beforeEach(() => {
    listenMock.mockReset();
  });

  afterEach(cleanup);

  it('subscribes, invokes the latest handler, and cleans up', async () => {
    const unlisten = vi.fn();
    let listener: ((event: Event<string>) => void) | undefined;
    listenMock.mockImplementation((_eventName, nextListener) => {
      listener = nextListener;
      return Promise.resolve(unlisten);
    });
    const firstHandler = vi.fn();
    const secondHandler = vi.fn();
    const { rerender, unmount } = renderHook(
      ({ handler }) => useTauriEvent('note-removed', handler),
      { initialProps: { handler: firstHandler } },
    );

    await waitFor(() => expect(listenMock).toHaveBeenCalledOnce());
    rerender({ handler: secondHandler });
    act(() => listener?.({ event: 'note-removed', id: 1, payload: '/notes/a.md' }));

    expect(firstHandler).not.toHaveBeenCalled();
    expect(secondHandler).toHaveBeenCalledOnce();
    expect(listenMock).toHaveBeenCalledOnce();
    unmount();
    expect(unlisten).toHaveBeenCalledOnce();
  });

  it('cleans up when listen resolves after unmount', async () => {
    const pending = deferredListener();
    const unlisten = vi.fn();
    listenMock.mockReturnValue(pending.promise);
    const { unmount } = renderHook(() => useTauriEvent('todos-changed', vi.fn()));

    unmount();
    pending.resolve(unlisten);

    await waitFor(() => expect(unlisten).toHaveBeenCalledOnce());
  });

  it('handles listen rejection without an unhandled promise rejection', async () => {
    const error = new Error('event bridge unavailable');
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    listenMock.mockRejectedValue(error);

    renderHook(() => useTauriEvent('bookmarks-changed', vi.fn()));

    await waitFor(() =>
      expect(consoleError).toHaveBeenCalledWith(
        'Failed to listen for Tauri event "bookmarks-changed"',
        error,
      ),
    );
    consoleError.mockRestore();
  });

  it('does not subscribe while disabled', () => {
    renderHook(() => useTauriEvent('note-changed', vi.fn(), false));
    expect(listenMock).not.toHaveBeenCalled();
  });
});
