import { QueryClient, type InfiniteData } from '@tanstack/react-query';
import { beforeEach, expect, it, vi } from 'vitest';
import type { RssEntry, RssEntryPage } from '@/types';

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

it('updates an entry across paged RSS caches without changing page params', async () => {
  const { rssEntriesKey, updateRssEntryQueries } = await import('./rss.api');
  const client = new QueryClient();
  const key = rssEntriesKey({ mode: 'all' });
  const entry = {
    id: 7,
    feed_id: 1,
    feed_title: 'Feed',
    title: 'Entry',
    link: null,
    author: null,
    content_html: '',
    summary: '',
    published_at: null,
    fetched_at: 1,
    is_read: false,
  } satisfies RssEntry;
  client.setQueryData<InfiniteData<RssEntryPage>>(key, {
    pages: [
      { entries: [entry], next_cursor: 'next' },
      { entries: [{ ...entry, id: 8 }], next_cursor: null },
    ],
    pageParams: [null, 'next'],
  });

  updateRssEntryQueries(client, { ...entry, is_read: true });

  const updated = client.getQueryData<InfiniteData<RssEntryPage>>(key);
  expect(updated?.pages[0].entries[0].is_read).toBe(true);
  expect(updated?.pages[1].entries[0].id).toBe(8);
  expect(updated?.pageParams).toEqual([null, 'next']);
});
