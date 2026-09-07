import { describe, expect, it, vi } from 'vitest';

const writes: Array<{ revision: number; relativePath: string; content: string }> = [];
const releases: Array<() => void> = [];

vi.mock('./notes.api', () => ({
  writeNoteContentApi: vi.fn(
    (input: { revision: number; relativePath: string; content: string }) => {
      writes.push(input);
      return new Promise<void>((resolve) => releases.push(resolve));
    },
  ),
}));

import { sharedNoteSaveQueue } from './note-save';

describe('sharedNoteSaveQueue', () => {
  it('orders the same path across separate consumers', async () => {
    const firstConsumerSave = sharedNoteSaveQueue.enqueue('1:shared.md', 'old');
    const secondConsumerSave = sharedNoteSaveQueue.enqueue('1:shared.md', 'new');

    expect(writes).toEqual([{ revision: 1, relativePath: 'shared.md', content: 'old' }]);
    releases.shift()!();
    await firstConsumerSave;
    await vi.waitFor(() =>
      expect(writes).toEqual([
        { revision: 1, relativePath: 'shared.md', content: 'old' },
        { revision: 1, relativePath: 'shared.md', content: 'new' },
      ]),
    );
    releases.shift()!();
    await secondConsumerSave;
  });
});
