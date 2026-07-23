// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Bookmark, BookmarkPage } from '@/types';
import BookmarkView from './BookmarkView';

const queryBookmarksMock = vi.hoisted(() => vi.fn());

vi.mock('./bookmarks.api', async (importOriginal) => {
  const original = await importOriginal<typeof import('./bookmarks.api')>();
  return { ...original, queryBookmarksApi: queryBookmarksMock };
});

vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn().mockResolvedValue(() => {}),
}));

vi.mock('./SearchBar', () => ({
  default: () => <div data-testid="search-bar" />,
}));
vi.mock('./TagPanel', () => ({
  default: () => <div data-testid="tag-panel" />,
}));
vi.mock('./AddBookmarkDialog', () => ({
  default: () => null,
}));
vi.mock('./ResultList', () => ({
  default: (props: {
    bookmarks: Bookmark[];
    hasMore: boolean;
    nextPageError: string | null;
    onLoadMore: () => void;
  }) => (
    <div>
      {props.bookmarks.map((bookmark) => (
        <div key={bookmark.id}>{bookmark.title}</div>
      ))}
      {props.hasMore && <button onClick={props.onLoadMore}>加载更多</button>}
      {props.nextPageError && <div>{props.nextPageError}</div>}
    </div>
  ),
}));

function bookmark(id: number, title: string): Bookmark {
  return {
    id,
    url: `https://example.com/${id}`,
    title,
    description: '',
    tags: [],
    access_count: 0,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    accessed_at: null,
  };
}

function renderView() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <BookmarkView />
    </QueryClientProvider>,
  );
}

describe('BookmarkView infinite pagination', () => {
  beforeEach(() => {
    queryBookmarksMock.mockReset();
  });

  it('flattens pages and loads the next cursor once', async () => {
    queryBookmarksMock.mockImplementation(
      ({ cursor }: { cursor: string | null }): Promise<BookmarkPage> =>
        Promise.resolve(
          cursor === null
            ? { items: [bookmark(1, 'First')], next_cursor: 'next' }
            : { items: [bookmark(2, 'Second')], next_cursor: null },
        ),
    );
    renderView();

    expect(await screen.findByText('First')).toBeTruthy();
    fireEvent.click(screen.getByText('加载更多'));
    expect(await screen.findByText('Second')).toBeTruthy();
    expect(screen.getByText('First')).toBeTruthy();
    expect(queryBookmarksMock).toHaveBeenCalledTimes(2);
  });

  it('keeps existing rows when the next page fails', async () => {
    queryBookmarksMock
      .mockResolvedValueOnce({
        items: [bookmark(1, 'Still visible')],
        next_cursor: 'next',
      })
      .mockRejectedValueOnce(new Error('下一页失败'));
    renderView();

    expect(await screen.findByText('Still visible')).toBeTruthy();
    fireEvent.click(screen.getByText('加载更多'));
    await waitFor(() => expect(screen.getByText('下一页失败')).toBeTruthy());
    expect(screen.getByText('Still visible')).toBeTruthy();
  });
});
