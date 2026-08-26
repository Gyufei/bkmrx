// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, expect, it, vi } from 'vitest';

import AddFeedDialog from './AddFeedDialog';
import { previewFeedApi } from './rss.api';

vi.mock('./rss.api', () => ({
  RSS_FEEDS_KEY: ['rss-feeds'],
  RSS_ENTRIES_KEY: ['rss-entries'],
  previewFeedApi: vi.fn(),
  createFeedApi: vi.fn(),
  invalidateRssQueries: vi.fn(),
}));

afterEach(cleanup);

it('allows long preview titles to shrink inside the dialog', async () => {
  const longTitle = '一篇非常长且不应该撑开订阅弹窗的 RSS 文章标题'.repeat(8);
  vi.mocked(previewFeedApi).mockResolvedValue({
    source_url: 'https://example.com',
    candidates: [
      {
        title: 'Example Feed',
        feed_url: 'https://example.com/feed.xml',
        site_url: 'https://example.com',
        recent_entries: [{ title: longTitle, published_at: null }],
      },
    ],
  });
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  render(
    <QueryClientProvider client={client}>
      <AddFeedDialog open onOpenChange={vi.fn()} onExistingFeed={vi.fn()} />
    </QueryClientProvider>,
  );

  fireEvent.change(screen.getByLabelText('订阅地址'), {
    target: { value: 'https://example.com/feed.xml' },
  });
  fireEvent.click(screen.getByRole('button', { name: '检测订阅' }));

  const title = await screen.findByText(longTitle);
  const dialog = screen.getByRole('dialog');
  expect(dialog.querySelector('form')?.classList.contains('min-w-0')).toBe(true);
  expect(title.parentElement?.classList.contains('min-w-0')).toBe(true);
});
