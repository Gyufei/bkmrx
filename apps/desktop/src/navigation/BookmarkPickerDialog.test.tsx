// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { bookmarkId, navigationCategoryId } from '@/test-utils/identity';
import type { Bookmark, BookmarkPage } from '@/types';
import BookmarkPickerDialog from './BookmarkPickerDialog';

const queryBookmarks = vi.hoisted(() => vi.fn());

vi.mock('@/lib/invoke', () => ({
  invokeQueryBookmarks: queryBookmarks,
}));

function bookmark(sequence: number, title: string): Bookmark {
  return {
    id: bookmarkId(sequence),
    url: `https://example.com/${sequence}`,
    title,
    description: '',
    tags: [],
    access_count: 0,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    accessed_at: null,
    starred_at: null,
  };
}

function page(items: Bookmark[]): BookmarkPage {
  return { items, next_cursor: null };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((next) => {
    resolve = next;
  });
  return { promise, resolve };
}

function renderPicker() {
  return render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <BookmarkPickerDialog
        categoryId={navigationCategoryId(1)}
        categoryName="工具"
        assigned={[]}
        pending={false}
        onOpenChange={vi.fn()}
        onAdd={vi.fn()}
      />
    </QueryClientProvider>,
  );
}

describe('BookmarkPickerDialog search', () => {
  afterEach(cleanup);

  beforeEach(() => {
    queryBookmarks.mockReset();
  });

  it('keeps a fixed results area and previous matches while a search is pending', async () => {
    const search = deferred<BookmarkPage>();
    queryBookmarks.mockImplementation(async (request: { mode: string }) => {
      if (request.mode === 'search') return search.promise;
      return page([bookmark(1, 'Example Docs')]);
    });

    renderPicker();
    expect(await screen.findByText('Example Docs')).toBeVisible();
    expect(screen.getByRole('list', { name: '书签搜索结果' })).toHaveClass('h-72');
    expect(queryBookmarks).toHaveBeenCalledTimes(1);

    fireEvent.change(screen.getByRole('textbox', { name: '搜索现有书签' }), {
      target: { value: 'other' },
    });
    expect(queryBookmarks).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Example Docs')).toBeVisible();
    expect(screen.queryByText('正在加载书签…')).not.toBeInTheDocument();

    expect(await screen.findByText('Example Docs')).toBeVisible();
    await waitFor(() => expect(queryBookmarks).toHaveBeenCalledTimes(2));
    expect(screen.getByText('Example Docs')).toBeVisible();
    expect(screen.queryByText('正在加载书签…')).not.toBeInTheDocument();

    search.resolve(page([bookmark(2, 'Other Site')]));
    expect(await screen.findByText('Other Site')).toBeVisible();
    expect(screen.queryByText('Example Docs')).not.toBeInTheDocument();
    expect(screen.getByRole('list', { name: '书签搜索结果' })).toHaveClass('h-72');
  });
});
