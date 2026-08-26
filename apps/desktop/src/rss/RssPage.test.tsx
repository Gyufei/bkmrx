// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { save } from '@tauri-apps/plugin-dialog';
import { open } from '@tauri-apps/plugin-shell';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import RssPage from './RssPage';

const {
  listFeedsApi,
  listEntriesApi,
  markEntryReadApi,
  refreshAllFeedsApi,
  downloadRssImageApi,
  toastAdd,
} = vi.hoisted(() => ({
  listFeedsApi: vi.fn(),
  listEntriesApi: vi.fn(),
  markEntryReadApi: vi.fn(),
  refreshAllFeedsApi: vi.fn(),
  downloadRssImageApi: vi.fn(),
  toastAdd: vi.fn(),
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
  invalidateRssQueries: (client: QueryClient) =>
    Promise.all([
      client.invalidateQueries({ queryKey: ['rss-feeds'] }),
      client.invalidateQueries({ queryKey: ['rss-entries'] }),
    ]),
  updateRssEntryQueries: (client: QueryClient, updated: { id: number }) =>
    client.setQueriesData<{
      pages: Array<{ entries: Array<{ id: number }> }>;
      pageParams: unknown[];
    }>({ queryKey: ['rss-entries'] }, (data) =>
      data
        ? {
            ...data,
            pages: data.pages.map((page) => ({
              ...page,
              entries: page.entries.map((entry) =>
                entry.id === updated.id ? { ...entry, ...updated } : entry,
              ),
            })),
          }
        : data,
    ),
}));
vi.mock('./AddFeedDialog', () => ({ default: () => null }));
vi.mock('./RenameFeedDialog', () => ({
  default: ({ feed }: { feed: { title: string } | null }) =>
    feed ? <div>Editing {feed.title}</div> : null,
}));
vi.mock('@tauri-apps/plugin-shell', () => ({ open: vi.fn() }));
vi.mock('@tauri-apps/plugin-dialog', () => ({ save: vi.fn() }));
vi.mock('@/components/ui/toast', () => ({ toast: { add: toastAdd } }));

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
  vi.mocked(open).mockResolvedValue(undefined);
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

it('shows a toast when refreshing all feeds fails', async () => {
  refreshAllFeedsApi
    .mockResolvedValueOnce({ refreshed: 0, added: 0, failed: 0 })
    .mockRejectedValueOnce(new Error('RSS 刷新失败'));
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <RssPage />
    </QueryClientProvider>,
  );

  await waitFor(() => expect(refreshAllFeedsApi).toHaveBeenCalledOnce());
  fireEvent.click(await screen.findByRole('button', { name: '刷新全部' }));

  await waitFor(() =>
    expect(toastAdd).toHaveBeenCalledWith({ type: 'error', title: 'RSS 刷新失败' }),
  );
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
  const contentTrigger = image.closest('[data-slot="context-menu-trigger"]');
  expect(contentTrigger).toBeTruthy();
  expect(contentTrigger?.classList.contains('select-text')).toBe(true);
  expect(contentTrigger?.classList.contains('select-none')).toBe(false);
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

it('shows a fixed capsule of reader actions for the selected article', async () => {
  refreshAllFeedsApi.mockReturnValue(new Promise(() => {}));
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <RssPage />
    </QueryClientProvider>,
  );

  fireEvent.click(await screen.findByRole('button', { name: /Unread article/ }));

  const toolbar = await screen.findByRole('complementary', { name: '阅读工具' });
  expect(toolbar.classList.contains('absolute')).toBe(true);
  expect(screen.getByRole('button', { name: '隐藏图片' })).toBeTruthy();
  expect(screen.getByRole('button', { name: '翻译' })).toBeTruthy();
  expect(screen.getByRole('button', { name: '收藏当前网站到书签' })).toBeTruthy();
});

it('keeps no-image mode enabled when switching articles', async () => {
  refreshAllFeedsApi.mockReturnValue(new Promise(() => {}));
  listEntriesApi.mockResolvedValue({
    entries: [
      {
        id: 7,
        feed_id: 1,
        feed_title: 'Feed',
        title: 'First article',
        link: null,
        author: null,
        content_html: '<p>First</p><img src="https://example.com/first.jpg">',
        summary: 'First',
        published_at: 100,
        fetched_at: 100,
        is_read: true,
      },
      {
        id: 8,
        feed_id: 1,
        feed_title: 'Feed',
        title: 'Second article',
        link: null,
        author: null,
        content_html: '<p>Second</p><img src="https://example.com/second.jpg">',
        summary: 'Second',
        published_at: 101,
        fetched_at: 101,
        is_read: true,
      },
    ],
    next_cursor: null,
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <RssPage />
    </QueryClientProvider>,
  );

  fireEvent.click(await screen.findByRole('button', { name: /First article/ }));
  fireEvent.click(screen.getByRole('button', { name: '隐藏图片' }));
  expect(
    document.querySelector('[data-rss-entry-content]')?.classList.contains('[&_img]:hidden'),
  ).toBe(true);

  fireEvent.click(screen.getByRole('button', { name: /Second article/ }));
  expect(
    document.querySelector('[data-rss-entry-content]')?.classList.contains('[&_img]:hidden'),
  ).toBe(true);
  expect(screen.getByRole('button', { name: '显示图片' }).getAttribute('aria-pressed')).toBe(
    'true',
  );
});

it('opens article links externally for left and middle clicks without navigating the webview', async () => {
  refreshAllFeedsApi.mockReturnValue(new Promise(() => {}));
  listEntriesApi.mockResolvedValue({
    entries: [
      {
        id: 7,
        feed_id: 1,
        feed_title: 'Feed',
        title: 'Unread article',
        link: null,
        author: null,
        content_html: '<a href="https://example.com/article"><span>External article</span></a>',
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
    content_html: '<a href="https://example.com/article"><span>External article</span></a>',
    summary: 'Body',
    published_at: 100,
    fetched_at: 100,
    is_read: true,
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <RssPage />
    </QueryClientProvider>,
  );

  fireEvent.click(await screen.findByRole('button', { name: /Unread article/ }));
  await waitFor(() => expect(markEntryReadApi).toHaveBeenCalled());
  await act(async () => {});
  const nestedLinkContent = await waitFor(() => {
    const content = document.querySelector<HTMLElement>('[data-rss-entry-content]');
    const nested = content?.querySelector<HTMLElement>('a span');
    expect(nested).toBeTruthy();
    return nested!;
  });
  const leftClick = new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 });
  const middleClick = new MouseEvent('auxclick', { bubbles: true, cancelable: true, button: 1 });

  nestedLinkContent.dispatchEvent(leftClick);
  nestedLinkContent.dispatchEvent(middleClick);

  expect(leftClick.defaultPrevented).toBe(true);
  expect(middleClick.defaultPrevented).toBe(true);
  expect(open).toHaveBeenNthCalledWith(1, 'https://example.com/article');
  expect(open).toHaveBeenNthCalledWith(2, 'https://example.com/article');
});

it('blocks non-http article links', async () => {
  refreshAllFeedsApi.mockReturnValue(new Promise(() => {}));
  listEntriesApi.mockResolvedValue({
    entries: [
      {
        id: 7,
        feed_id: 1,
        feed_title: 'Feed',
        title: 'Unread article',
        link: null,
        author: null,
        content_html: '<a href="mailto:test@example.com">Email link</a>',
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
    content_html: '<a href="mailto:test@example.com">Email link</a>',
    summary: 'Body',
    published_at: 100,
    fetched_at: 100,
    is_read: true,
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <RssPage />
    </QueryClientProvider>,
  );

  fireEvent.click(await screen.findByRole('button', { name: /Unread article/ }));
  await waitFor(() => expect(markEntryReadApi).toHaveBeenCalled());
  await act(async () => {});
  const emailLink = await waitFor(() => {
    const content = document.querySelector<HTMLElement>('[data-rss-entry-content]');
    const anchor = content?.querySelector<HTMLElement>('a');
    expect(anchor).toBeTruthy();
    return anchor!;
  });
  const click = new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 });

  emailLink.dispatchEvent(click);

  expect(click.defaultPrevented).toBe(true);
  expect(open).not.toHaveBeenCalled();
});
