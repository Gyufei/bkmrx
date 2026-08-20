// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { save } from '@tauri-apps/plugin-dialog';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import RssPage from './RssPage';

const { listFeedsApi, listEntriesApi, markEntryReadApi, refreshAllFeedsApi, downloadRssImageApi } =
  vi.hoisted(() => ({
    listFeedsApi: vi.fn(),
    listEntriesApi: vi.fn(),
    markEntryReadApi: vi.fn(),
    refreshAllFeedsApi: vi.fn(),
    downloadRssImageApi: vi.fn(),
  }));

vi.mock('./rss.api', () => ({
  RSS_FEEDS_KEY: ['rss-feeds'],
  RSS_ENTRIES_KEY: ['rss-entries'],
  rssEntriesKey: (scope: unknown) => ['rss-entries', scope],
  listFeedsApi,
  listEntriesApi,
  markEntryReadApi,
  refreshAllFeedsApi,
  refreshFeedApi: vi.fn(),
  deleteFeedApi: vi.fn(),
  downloadRssImageApi,
}));
vi.mock('./AddFeedDialog', () => ({ default: () => null }));
vi.mock('./RenameFeedDialog', () => ({
  default: ({ feed }: { feed: { title: string } | null }) =>
    feed ? <div>Editing {feed.title}</div> : null,
}));
vi.mock('@tauri-apps/plugin-shell', () => ({ open: vi.fn() }));
vi.mock('@tauri-apps/plugin-dialog', () => ({ save: vi.fn() }));

beforeEach(() => {
  vi.clearAllMocks();
  listFeedsApi.mockResolvedValue([
    { id: 1, title: 'Feed', custom_title: null, entry_count: 1, unread_count: 1 },
  ]);
  listEntriesApi.mockResolvedValue({
    entries: [
      {
        id: 7,
        feed_id: 1,
        feed_title: 'Feed',
        title: 'Unread article',
        link: null,
        author: null,
        content_html: '<p>Body</p><img src="https://example.com/photo.jpg">',
        summary: 'Body',
        published_at: 100,
        fetched_at: 100,
        is_read: false,
      },
    ],
    next_cursor: null,
  });
  markEntryReadApi.mockResolvedValue({
    id: 7,
    feed_id: 1,
    feed_title: 'Feed',
    title: 'Unread article',
    link: null,
    author: null,
    content_html: '<p>Body</p><img src="https://example.com/photo.jpg">',
    summary: 'Body',
    published_at: 100,
    fetched_at: 100,
    is_read: true,
  });
  refreshAllFeedsApi.mockResolvedValue({ refreshed: 0, added: 0, failed: 0 });
  downloadRssImageApi.mockResolvedValue(undefined);
  vi.mocked(save).mockResolvedValue('/tmp/photo.jpg');
});

afterEach(cleanup);

it('keeps a newly read article selected in the unread cache without refetching entries', async () => {
  refreshAllFeedsApi.mockReturnValue(new Promise(() => {}));
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <RssPage />
    </QueryClientProvider>,
  );

  fireEvent.click(await screen.findByRole('button', { name: /^未读/ }));
  fireEvent.click(await screen.findByRole('button', { name: /Unread article/ }));

  expect(await screen.findByRole('button', { name: '标为未读' })).toBeTruthy();
  expect(screen.getAllByText('Unread article')).toHaveLength(2);
  await waitFor(() => expect(markEntryReadApi).toHaveBeenCalledWith(7, true));
  expect(listEntriesApi).toHaveBeenCalledTimes(2);
});

it('offers edit, refresh, and delete as feed context-menu actions', async () => {
  refreshAllFeedsApi.mockReturnValue(new Promise(() => {}));
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <RssPage />
    </QueryClientProvider>,
  );

  fireEvent.contextMenu(await screen.findByRole('button', { name: /^Feed/ }));

  expect(await screen.findByText('编辑名称')).toBeTruthy();
  expect(screen.getByText('刷新订阅')).toBeTruthy();
  expect(screen.getByText('删除订阅')).toBeTruthy();
  fireEvent.click(screen.getByText('编辑名称'));
  expect(await screen.findByText('Editing Feed')).toBeTruthy();
});

it('uses the note selection color for the selected feed', async () => {
  refreshAllFeedsApi.mockReturnValue(new Promise(() => {}));
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <RssPage />
    </QueryClientProvider>,
  );

  const feed = await screen.findByRole('button', { name: /^Feed/ });
  expect(document.querySelector('.fill-chart-5')).toBeTruthy();
  fireEvent.click(feed);
  expect(feed.parentElement?.classList.contains('bg-primary/15')).toBe(true);
});

it('downloads a right-clicked article image through the shadcn context menu', async () => {
  refreshAllFeedsApi.mockReturnValue(new Promise(() => {}));
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <RssPage />
    </QueryClientProvider>,
  );

  fireEvent.click(await screen.findByRole('button', { name: /Unread article/ }));
  await waitFor(() => expect(markEntryReadApi).toHaveBeenCalled());
  const image = await waitFor(() => {
    const articleImage = document.querySelector<HTMLImageElement>('[data-rss-entry-content] img');
    expect(articleImage).toBeTruthy();
    return articleImage!;
  });
  expect(image.closest('[data-slot="context-menu-trigger"]')).toBeTruthy();
  fireEvent.contextMenu(image, { button: 2, clientX: 120, clientY: 80 });
  fireEvent.click(await screen.findByText('保存图片…'));

  await waitFor(() =>
    expect(downloadRssImageApi).toHaveBeenCalledWith(
      'https://example.com/photo.jpg',
      null,
      '/tmp/photo.jpg',
    ),
  );
});
