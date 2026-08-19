import { beforeEach, expect, it, vi } from 'vitest';

const invoke = vi.fn();
vi.mock('@tauri-apps/api/core', () => ({ invoke }));

beforeEach(() => invoke.mockReset());

it('sends the tagged RSS scope and cursor through the Tauri contract', async () => {
  const { listEntriesApi } = await import('./rss.api');
  invoke.mockResolvedValue({ entries: [], next_cursor: null });

  await listEntriesApi({ mode: 'feed', feed_id: 7 }, 'next');

  expect(invoke).toHaveBeenCalledWith('list_rss_entries', {
    request: { scope: { mode: 'feed', feed_id: 7 }, cursor: 'next' },
  });
});
