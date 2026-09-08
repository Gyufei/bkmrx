import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DocumentSession, type DocumentSessionIO } from './document-session';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function createIO(): DocumentSessionIO {
  return {
    open: vi.fn().mockResolvedValue({ content: 'start', receipt: 'receipt-1' }),
    save: vi.fn().mockResolvedValue({ receipt: 'receipt-2' }),
    rename: vi.fn().mockResolvedValue({ relative_path: 'renamed.md', receipt: 'receipt-2' }),
    delete: vi.fn().mockResolvedValue(undefined),
  };
}

describe('DocumentSession', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('opens one document and publishes its ready snapshot', async () => {
    const io = createIO();
    const session = new DocumentSession({ revision: 7, path: 'note.md', io, debounceMs: 400 });

    await session.open();

    expect(io.open).toHaveBeenCalledWith(7, 'note.md');
    expect(session.getSnapshot()).toMatchObject({
      content: 'start',
      loadState: 'ready',
      dirty: false,
    });
  });

  it('preserves frontmatter exactly when saving an edited body', async () => {
    const io = createIO();
    vi.mocked(io.open).mockResolvedValue({
      content: '\uFEFF---\r\ntitle: "Note"\r\n# keep this comment\r\n---\r\n\r\n# Before',
      receipt: 'receipt-1',
    });
    const session = new DocumentSession({ revision: 7, path: 'note.md', io });

    await session.open();
    expect(session.getSnapshot().content).toBe('# Before');
    session.edit('# After');
    await session.flush();

    expect(io.save).toHaveBeenCalledWith(
      'receipt-1',
      '\uFEFF---\r\ntitle: "Note"\r\n# keep this comment\r\n---\r\n\r\n# After',
    );
  });

  it('treats an unterminated frontmatter block as editable content', async () => {
    const io = createIO();
    vi.mocked(io.open).mockResolvedValue({
      content: '---\ntitle: Note\n# Still content',
      receipt: 'receipt-1',
    });
    const session = new DocumentSession({ revision: 7, path: 'note.md', io });

    await session.open();

    expect(session.getSnapshot().content).toBe('---\ntitle: Note\n# Still content');
  });

  it('preserves frontmatter in pending content passed to rename', async () => {
    const io = createIO();
    vi.mocked(io.open).mockResolvedValue({
      content: '---\ntitle: Note\n---\n# Before',
      receipt: 'receipt-1',
    });
    const session = new DocumentSession({ revision: 7, path: 'note.md', io });
    await session.open();
    session.edit('# After');

    await session.rename('renamed.md');

    expect(io.rename).toHaveBeenCalledWith(
      'receipt-1',
      'renamed.md',
      '---\ntitle: Note\n---\n# After',
    );
  });

  it('serializes saves and coalesces edits to the latest follow-up draft', async () => {
    const first = deferred<{ receipt: string }>();
    const io = createIO();
    vi.mocked(io.save)
      .mockReturnValueOnce(first.promise)
      .mockResolvedValueOnce({ receipt: 'receipt-3' });
    const session = new DocumentSession({ revision: 7, path: 'note.md', io, debounceMs: 400 });
    await session.open();

    session.edit('first');
    await vi.advanceTimersByTimeAsync(400);
    session.edit('second');
    await vi.advanceTimersByTimeAsync(400);
    session.edit('latest');
    await vi.advanceTimersByTimeAsync(400);
    expect(io.save).toHaveBeenCalledTimes(1);

    first.resolve({ receipt: 'receipt-2' });
    await session.flush();

    expect(io.save).toHaveBeenNthCalledWith(1, 'receipt-1', 'first');
    expect(io.save).toHaveBeenNthCalledWith(2, 'receipt-2', 'latest');
    expect(session.getSnapshot().dirty).toBe(false);
  });

  it('retires after rename so disposal cannot save the old identity', async () => {
    const io = createIO();
    const session = new DocumentSession({ revision: 7, path: 'note.md', io, debounceMs: 400 });
    await session.open();
    session.edit('draft');

    await expect(session.rename('renamed.md')).resolves.toBe('renamed.md');
    session.dispose();
    await Promise.resolve();

    expect(io.rename).toHaveBeenCalledWith('receipt-1', 'renamed.md', 'draft');
    expect(io.save).not.toHaveBeenCalled();
  });

  it('resumes autosave when a terminal operation fails', async () => {
    const io = createIO();
    vi.mocked(io.delete).mockRejectedValueOnce(new Error('delete failed'));
    const session = new DocumentSession({ revision: 7, path: 'note.md', io, debounceMs: 400 });
    await session.open();
    session.edit('draft');

    await expect(session.delete()).rejects.toThrow('delete failed');
    await vi.advanceTimersByTimeAsync(400);

    expect(io.save).toHaveBeenCalledWith('receipt-1', 'draft');
  });

  it('keeps a newer edit dirty until the follow-up save completes', async () => {
    const first = deferred<{ receipt: string }>();
    const second = deferred<{ receipt: string }>();
    const io = createIO();
    vi.mocked(io.save).mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const session = new DocumentSession({ revision: 7, path: 'note.md', io, debounceMs: 400 });
    await session.open();

    session.edit('first');
    const flush = session.flush();
    session.edit('latest');
    first.resolve({ receipt: 'receipt-2' });
    await Promise.resolve();

    expect(session.getSnapshot().dirty).toBe(true);
    expect(io.save).toHaveBeenLastCalledWith('receipt-2', 'latest');
    second.resolve({ receipt: 'receipt-3' });
    await flush;
    expect(session.getSnapshot()).toMatchObject({ dirty: false, saveState: 'saved' });
  });

  it('retains a failed draft and reuses one in-flight retry', async () => {
    const retryWrite = deferred<{ receipt: string }>();
    const io = createIO();
    vi.mocked(io.save)
      .mockRejectedValueOnce(new Error('disk full'))
      .mockReturnValueOnce(retryWrite.promise);
    const session = new DocumentSession({ revision: 7, path: 'note.md', io });
    await session.open();
    session.edit('draft');
    await session.flush().catch(() => undefined);

    const firstRetry = session.retrySave();
    const secondRetry = session.retrySave();
    let secondSettled = false;
    void secondRetry.then(() => {
      secondSettled = true;
    });
    await Promise.resolve();
    expect(io.save).toHaveBeenCalledTimes(2);
    expect(secondSettled).toBe(false);

    retryWrite.resolve({ receipt: 'receipt-2' });
    await Promise.all([firstRetry, secondRetry]);
    expect(session.getSnapshot()).toMatchObject({ dirty: false, saveError: null });
  });

  it('can flush a failed draft after dismissing its error', async () => {
    const io = createIO();
    vi.mocked(io.save)
      .mockRejectedValueOnce(new Error('disk full'))
      .mockResolvedValueOnce({ receipt: 'receipt-2' });
    const session = new DocumentSession({ revision: 7, path: 'note.md', io });
    await session.open();
    session.edit('draft');
    await session.flush().catch(() => undefined);

    session.dismissSaveError();
    await session.flush();

    expect(io.save).toHaveBeenCalledTimes(2);
    expect(session.getSnapshot().dirty).toBe(false);
  });

  it('retries a failed open', async () => {
    const io = createIO();
    vi.mocked(io.open)
      .mockRejectedValueOnce(new Error('missing'))
      .mockResolvedValueOnce({ content: 'recovered', receipt: 'receipt-1' });
    const session = new DocumentSession({ revision: 7, path: 'note.md', io });

    await session.open().catch(() => undefined);
    expect(session.getSnapshot().loadState).toBe('error');
    await session.retryRead();

    expect(session.getSnapshot()).toMatchObject({ content: 'recovered', loadState: 'ready' });
  });

  it('waits for an in-flight save before deleting with its latest receipt', async () => {
    const write = deferred<{ receipt: string }>();
    const io = createIO();
    vi.mocked(io.save).mockReturnValueOnce(write.promise);
    const session = new DocumentSession({ revision: 7, path: 'note.md', io });
    await session.open();
    session.edit('draft');
    const save = session.flush();

    const deletion = session.delete();
    expect(io.delete).not.toHaveBeenCalled();
    write.resolve({ receipt: 'receipt-2' });
    await save;
    await deletion;

    expect(io.delete).toHaveBeenCalledWith('receipt-2');
  });

  it('flushes a scheduled draft once when disposed', async () => {
    const io = createIO();
    const session = new DocumentSession({ revision: 7, path: 'note.md', io, debounceMs: 400 });
    await session.open();
    session.edit('draft');

    session.dispose();
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(400);

    expect(io.save).toHaveBeenCalledOnce();
    expect(io.save).toHaveBeenCalledWith('receipt-1', 'draft');
  });
});
