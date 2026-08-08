// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useState } from 'react';

import type { BookmarkBaseView } from '@/types';
import BookmarkSidebar from './BookmarkSidebar';

const queryTagsMock = vi.hoisted(() => vi.fn());

vi.mock('./bookmarks.api', async (importOriginal) => {
  const original = await importOriginal<typeof import('./bookmarks.api')>();
  return {
    ...original,
    getTagsApi: queryTagsMock,
  };
});

function renderSidebar() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  function Wrapper() {
    const [selectedTags, setSelectedTags] = useState<string[]>([]);
    const [baseView, setBaseView] = useState<BookmarkBaseView>('all');
    return (
      <QueryClientProvider client={client}>
        <BookmarkSidebar
          selectedTags={selectedTags}
          onTagsChange={setSelectedTags}
          baseView={baseView}
          onBaseViewChange={setBaseView}
        />
      </QueryClientProvider>
    );
  }

  return render(<Wrapper />);
}

describe('BookmarkSidebar', () => {
  beforeEach(() => {
    queryTagsMock.mockReset();
  });

  afterEach(() => {
    cleanup();
  });

  it('requests the top fifty tags and defaults to the all view', async () => {
    queryTagsMock.mockResolvedValue([{ name: 'popular', count: 12 }]);
    renderSidebar();

    expect(await screen.findByText('popular')).toBeTruthy();
    expect(queryTagsMock).toHaveBeenCalledWith({ query: '', limit: 50 });
    expect(screen.getByText('全部').closest('button')?.getAttribute('aria-current')).toBe('page');

    fireEvent.click(screen.getByText('星标'));
    expect(screen.getByText('星标').closest('button')?.getAttribute('aria-current')).toBe('page');
  });

  it('debounces tag search and trims the request', async () => {
    queryTagsMock.mockImplementation(({ query }: { query: string }) =>
      Promise.resolve(query ? [{ name: 'rare-tag', count: 1 }] : []),
    );
    renderSidebar();
    await screen.findByText('未找到匹配标签');

    fireEvent.change(screen.getByLabelText('筛选标签'), { target: { value: '  rare  ' } });
    expect(queryTagsMock).toHaveBeenCalledTimes(1);

    expect(await screen.findByText('rare-tag')).toBeTruthy();
    expect(queryTagsMock).toHaveBeenLastCalledWith({ query: 'rare', limit: 50 });
  });

  it('keeps a selected low-frequency tag visible after clearing tag search', async () => {
    queryTagsMock.mockImplementation(({ query }: { query: string }) =>
      Promise.resolve(query ? [{ name: 'rare-tag', count: 1 }] : [{ name: 'popular', count: 10 }]),
    );
    renderSidebar();
    await screen.findByText('popular');

    fireEvent.change(screen.getByLabelText('筛选标签'), { target: { value: 'rare' } });
    fireEvent.click(await screen.findByText('rare-tag'));
    fireEvent.click(screen.getByLabelText('清空标签搜索'));

    const rareTag = await screen.findByText('rare-tag');
    expect(rareTag.closest('button')?.getAttribute('aria-pressed')).toBe('true');
    expect(await screen.findByText('popular')).toBeTruthy();
  });

  it('shows an error and retries the tag request', async () => {
    queryTagsMock
      .mockRejectedValueOnce(new Error('failed'))
      .mockResolvedValueOnce([{ name: 'recovered', count: 2 }]);
    renderSidebar();

    expect(await screen.findByText('标签加载失败')).toBeTruthy();
    fireEvent.click(screen.getByText('重试'));

    await waitFor(() => expect(screen.getByText('recovered')).toBeTruthy());
    expect(queryTagsMock).toHaveBeenCalledTimes(2);
  });

  it('keeps a selected tag visible while a new request is pending or failed', async () => {
    let rejectSearch!: (error: Error) => void;
    queryTagsMock
      .mockResolvedValueOnce([{ name: 'selected-tag', count: 2 }])
      .mockImplementationOnce(
        () =>
          new Promise((_, reject) => {
            rejectSearch = reject;
          }),
      );
    renderSidebar();

    fireEvent.click(await screen.findByText('selected-tag'));
    fireEvent.change(screen.getByLabelText('筛选标签'), { target: { value: 'missing' } });
    await waitFor(() => expect(queryTagsMock).toHaveBeenCalledTimes(2));

    expect(screen.getByText('selected-tag')).toBeTruthy();
    expect(screen.getByText('加载中…')).toBeTruthy();

    await act(async () => rejectSearch(new Error('failed')));
    expect(await screen.findByText('标签加载失败')).toBeTruthy();
    expect(screen.getByText('selected-tag')).toBeTruthy();
  });
});
