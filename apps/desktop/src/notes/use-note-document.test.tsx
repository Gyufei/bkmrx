// @vitest-environment jsdom

import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useNoteDocument } from './use-note-document';

const receiptApi = vi.hoisted(() => ({
  open: vi.fn(),
  save: vi.fn(),
  rename: vi.fn(),
  delete: vi.fn(),
}));

vi.mock('./notes.api', () => ({
  openNoteDocumentApi: receiptApi.open,
  saveNoteDocumentApi: receiptApi.save,
  renameNoteDocumentApi: receiptApi.rename,
  deleteNoteDocumentApi: receiptApi.delete,
}));

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

describe('useNoteDocument', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    receiptApi.open.mockResolvedValue({ content: 'start', receipt: 'receipt-1' });
    receiptApi.save.mockResolvedValue({ receipt: 'receipt-2' });
    receiptApi.rename.mockResolvedValue({ relative_path: 'renamed.md', receipt: 'receipt-2' });
    receiptApi.delete.mockResolvedValue(undefined);
  });
  afterEach(() => vi.useRealTimers());

  it('opens the selected document and publishes its content', async () => {
    receiptApi.open.mockResolvedValue({
      content: '---\ntitle: Note\n---\n# Note',
      receipt: 'receipt-1',
    });
    const { result } = renderHook(() => useNoteDocument('note.md', 7));

    await vi.waitFor(() => expect(result.current.loadState).toBe('ready'));

    expect(receiptApi.open).toHaveBeenCalledWith(7, 'note.md');
    expect(result.current.content).toBe('# Note');
  });

  it('replaces the session when the document identity changes', async () => {
    const first = deferred<{ content: string; receipt: string }>();
    receiptApi.open
      .mockReturnValueOnce(first.promise)
      .mockResolvedValueOnce({ content: 'second', receipt: 'receipt-2' });
    const { result, rerender } = renderHook(({ path }) => useNoteDocument(path, 7), {
      initialProps: { path: 'first.md' },
    });

    rerender({ path: 'second.md' });
    await vi.waitFor(() => expect(result.current.content).toBe('second'));
    first.resolve({ content: 'late first', receipt: 'receipt-1' });
    await act(async () => Promise.resolve());

    expect(result.current.content).toBe('second');
  });

  it('flushes a dirty draft when the hook unmounts', async () => {
    const { result, unmount } = renderHook(() => useNoteDocument('note.md', 7));
    await vi.waitFor(() => expect(result.current.loadState).toBe('ready'));
    act(() => result.current.setContent('draft'));

    unmount();
    await vi.waitFor(() => expect(receiptApi.save).toHaveBeenCalledWith('receipt-1', 'draft'));
  });

  it('exposes receipt-based rename', async () => {
    const { result } = renderHook(() => useNoteDocument('note.md', 7));
    await vi.waitFor(() => expect(result.current.loadState).toBe('ready'));
    act(() => result.current.setContent('draft'));

    await expect(result.current.rename('renamed.md')).resolves.toBe('renamed.md');

    expect(receiptApi.rename).toHaveBeenCalledWith('receipt-1', 'renamed.md', 'draft');
  });

  it('publishes save failures and retries the current draft', async () => {
    receiptApi.save
      .mockRejectedValueOnce(new Error('disk full'))
      .mockResolvedValueOnce({ receipt: 'receipt-2' });
    const { result } = renderHook(() => useNoteDocument('note.md', 7));
    await vi.waitFor(() => expect(result.current.loadState).toBe('ready'));
    act(() => result.current.setContent('draft'));

    await act(async () => result.current.flush().catch(() => undefined));
    expect(result.current.saveError?.error.message).toBe('disk full');
    await act(async () => result.current.retrySave());

    expect(receiptApi.save).toHaveBeenCalledTimes(2);
    expect(result.current.dirty).toBe(false);
  });
});
