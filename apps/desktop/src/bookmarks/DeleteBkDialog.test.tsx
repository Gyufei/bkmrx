// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import type { Bookmark } from '@/types';
import DeleteBkDialog from './DeleteBkDialog';

const deleteBookmarksApi = vi.hoisted(() => vi.fn());

vi.mock('./bookmarks.api', () => ({
  BkQueryApiKey: { BOOKMARKS: 'bookmarks', TAGS: 'tags' },
  deleteBookmarksApi,
}));

afterEach(cleanup);

it('only closes a bookmark deletion after it succeeds', async () => {
  let resolveDelete: (() => void) | undefined;
  deleteBookmarksApi.mockImplementation(
    () => new Promise<void>((resolve) => {
      resolveDelete = resolve;
    }),
  );
  const target: Bookmark = {
    id: 7,
    url: 'https://example.com',
    title: '示例书签',
    description: '',
    tags: [],
    access_count: 0,
    created_at: '',
    updated_at: '',
    accessed_at: null,
    starred_at: null,
  };
  const setDeleteTarget = vi.fn();
  const queryClient = new QueryClient();

  render(
    <QueryClientProvider client={queryClient}>
      <DeleteBkDialog deleteTarget={target} setDeleteTarget={setDeleteTarget} />
    </QueryClientProvider>,
  );

  fireEvent.click(screen.getByRole('button', { name: '删除' }));
  await waitFor(() => expect(deleteBookmarksApi.mock.calls[0]?.[0]).toEqual([7]));
  expect(setDeleteTarget).not.toHaveBeenCalled();
  expect(screen.getByRole('button', { name: '删除' }).getAttribute('disabled')).not.toBeNull();

  resolveDelete?.();
  await waitFor(() => expect(setDeleteTarget).toHaveBeenCalledWith(null));
});

it('clears a previous deletion error when a target is opened again', async () => {
  deleteBookmarksApi.mockRejectedValueOnce(new Error('删除服务不可用'));
  const target: Bookmark = {
    id: 7,
    url: 'https://example.com',
    title: '示例书签',
    description: '',
    tags: [],
    access_count: 0,
    created_at: '',
    updated_at: '',
    accessed_at: null,
    starred_at: null,
  };
  const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  function Harness() {
    const [deleteTarget, setDeleteTarget] = useState<Bookmark | null>(target);
    return (
      <>
        <button onClick={() => setDeleteTarget(target)}>重新打开</button>
        <DeleteBkDialog deleteTarget={deleteTarget} setDeleteTarget={setDeleteTarget} />
      </>
    );
  }

  render(
    <QueryClientProvider client={queryClient}>
      <Harness />
    </QueryClientProvider>,
  );

  fireEvent.click(screen.getByRole('button', { name: '删除' }));
  expect(await screen.findByText('删除失败：删除服务不可用')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: '取消' }));
  await waitFor(() => expect(screen.queryByText('确认删除')).toBeNull());
  fireEvent.click(screen.getByRole('button', { name: '重新打开' }));

  await waitFor(() => expect(screen.queryByText('删除失败：删除服务不可用')).toBeNull());
  expect(screen.getByRole('button', { name: '删除' })).toBeTruthy();
});
