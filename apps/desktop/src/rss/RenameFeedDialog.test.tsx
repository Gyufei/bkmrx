// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { RssFeed } from '@/types';
import RenameFeedDialog from './RenameFeedDialog';
import { renameFeedApi } from './rss.api';

vi.mock('./rss.api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./rss.api')>();
  return { ...actual, renameFeedApi: vi.fn() };
});

vi.mock('@/components/ui/dialog', () => ({
  Dialog: ({ open, children }: { open: boolean; children: ReactNode }) =>
    open ? <div>{children}</div> : null,
  DialogContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DialogDescription: ({ children }: { children: ReactNode }) => <p>{children}</p>,
  DialogHeader: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children }: { children: ReactNode }) => <h2>{children}</h2>,
}));

const feed: RssFeed = {
  id: 1,
  source_url: 'https://example.com',
  feed_url: 'https://example.com/feed.xml',
  site_url: 'https://example.com',
  title: 'Example',
  custom_title: null,
  entry_count: 0,
  unread_count: 0,
  last_successful_fetched_at: null,
  last_failed_at: null,
  last_error: null,
  created_at: 0,
  updated_at: 0,
};

beforeEach(() => {
  vi.mocked(renameFeedApi).mockReset();
});
afterEach(cleanup);

it('clears a previous rename error when another feed is opened', async () => {
  let rejectRename: (reason: Error) => void = () => undefined;
  vi.mocked(renameFeedApi).mockImplementation(
    () =>
      new Promise((_, reject) => {
        rejectRename = reject;
      }),
  );
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const view = render(
    <QueryClientProvider client={queryClient}>
      <RenameFeedDialog key={feed.id} feed={feed} onClose={vi.fn()} />
    </QueryClientProvider>,
  );

  fireEvent.click(screen.getByRole('button', { name: '保存' }));
  await waitFor(() => expect(renameFeedApi).toHaveBeenCalledOnce());
  rejectRename(new Error('名称保存失败'));
  expect(await screen.findByText('名称保存失败')).toBeInTheDocument();

  view.rerender(
    <QueryClientProvider client={queryClient}>
      <RenameFeedDialog key="closed" feed={null} onClose={vi.fn()} />
    </QueryClientProvider>,
  );
  view.rerender(
    <QueryClientProvider client={queryClient}>
      <RenameFeedDialog key={2} feed={{ ...feed, id: 2, title: 'Next' }} onClose={vi.fn()} />
    </QueryClientProvider>,
  );

  await waitFor(() => expect(screen.queryByText('名称保存失败')).toBeNull());
});
