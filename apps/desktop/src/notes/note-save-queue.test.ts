import { describe, expect, it, vi } from 'vitest';

import { NoteSaveQueue } from './note-save-queue';

function deferred() {
  let resolve!: () => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('NoteSaveQueue', () => {
  it('serializes saves for the same path', async () => {
    const firstWrite = deferred();
    const secondWrite = deferred();
    const write = vi
      .fn<(path: string, content: string) => Promise<void>>()
      .mockReturnValueOnce(firstWrite.promise)
      .mockReturnValueOnce(secondWrite.promise);
    const queue = new NoteSaveQueue(write);

    const first = queue.enqueue('/a.md', 'first');
    const second = queue.enqueue('/a.md', 'second');

    expect(write).toHaveBeenCalledTimes(1);
    firstWrite.resolve();
    await first;
    await vi.waitFor(() => expect(write).toHaveBeenNthCalledWith(2, '/a.md', 'second'));
    secondWrite.resolve();
    await second;
  });

  it('continues after a failed save', async () => {
    const write = vi
      .fn<(path: string, content: string) => Promise<void>>()
      .mockRejectedValueOnce(new Error('disk full'))
      .mockResolvedValueOnce();
    const queue = new NoteSaveQueue(write);

    const first = queue.enqueue('/a.md', 'first');
    const second = queue.enqueue('/a.md', 'second');

    await expect(first).rejects.toThrow('disk full');
    await expect(second).resolves.toBeUndefined();
    expect(write).toHaveBeenNthCalledWith(2, '/a.md', 'second');
  });

  it('allows different paths to save independently', () => {
    const write = vi.fn().mockReturnValue(new Promise<void>(() => {}));
    const queue = new NoteSaveQueue(write);

    void queue.enqueue('/a.md', 'a');
    void queue.enqueue('/b.md', 'b');

    expect(write).toHaveBeenCalledTimes(2);
  });

  it('pending waits for the latest write on the requested path', async () => {
    const firstWrite = deferred();
    const secondWrite = deferred();
    const write = vi
      .fn<(path: string, content: string) => Promise<void>>()
      .mockReturnValueOnce(firstWrite.promise)
      .mockReturnValueOnce(secondWrite.promise);
    const queue = new NoteSaveQueue(write);

    void queue.enqueue('/a.md', 'first');
    void queue.enqueue('/a.md', 'second');
    const pending = queue.pending('/a.md');
    let settled = false;
    void pending.then(() => {
      settled = true;
    });

    firstWrite.resolve();
    await vi.waitFor(() => expect(write).toHaveBeenCalledTimes(2));
    expect(settled).toBe(false);

    secondWrite.resolve();
    await pending;
    expect(settled).toBe(true);
  });

  it('pending follows a later write after an earlier failure', async () => {
    const write = vi
      .fn<(path: string, content: string) => Promise<void>>()
      .mockRejectedValueOnce(new Error('disk full'))
      .mockResolvedValueOnce();
    const queue = new NoteSaveQueue(write);

    const failed = queue.enqueue('/a.md', 'old');
    const recovered = queue.enqueue('/a.md', 'new');

    await expect(failed).rejects.toThrow('disk full');
    await expect(queue.pending('/a.md')).resolves.toBeUndefined();
    await expect(recovered).resolves.toBeUndefined();
    expect(write).toHaveBeenNthCalledWith(2, '/a.md', 'new');
  });

  it('passes empty content to the writer unchanged', async () => {
    const write = vi.fn<(path: string, content: string) => Promise<void>>().mockResolvedValue();
    const queue = new NoteSaveQueue(write);

    await queue.enqueue('/empty.md', '');

    expect(write).toHaveBeenCalledWith('/empty.md', '');
  });
});
