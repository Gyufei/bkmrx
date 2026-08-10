// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Bookmark } from '../types';
import EditBookmarkDialog from './EditBookmarkDialog';
import { updateBookmarkApi } from './bookmarks.api';

vi.mock('./bookmarks.api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./bookmarks.api')>();
  return {
    ...actual,
    updateBookmarkApi: vi.fn(),
  };
});

vi.mock('@/components/TagInput', () => ({
  default: () => <div>标签输入框</div>,
}));

const bookmark: Bookmark = {
  id: 7,
  url: 'https://old.example',
  title: 'Example',
  description: 'Description',
  tags: ['reference'],
  access_count: 0,
  created_at: '2026-08-10T00:00:00Z',
  updated_at: '2026-08-10T00:00:00Z',
  accessed_at: null,
  starred_at: null,
};

function renderDialog(setEditTarget = vi.fn()) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  const invalidateQueries = vi.spyOn(queryClient, 'invalidateQueries');

  render(
    <QueryClientProvider client={queryClient}>
      <EditBookmarkDialog editTarget={bookmark} setEditTarget={setEditTarget} />
    </QueryClientProvider>,
  );

  return { invalidateQueries, setEditTarget };
}

beforeEach(() => {
  vi.mocked(updateBookmarkApi).mockReset();
});

afterEach(cleanup);

describe('EditBookmarkDialog', () => {
  it('prefills the current URL', () => {
    renderDialog();

    expect(screen.getByLabelText('URL')).toHaveValue('https://old.example');
  });

  it('trims the URL before updating without changing the title automatically', async () => {
    vi.mocked(updateBookmarkApi).mockResolvedValue({
      ...bookmark,
      url: 'https://new.example',
    });
    renderDialog();

    fireEvent.change(screen.getByLabelText('URL'), {
      target: { value: '  https://new.example  ' },
    });
    fireEvent.click(screen.getByRole('button', { name: '保存' }));

    await waitFor(() => expect(updateBookmarkApi).toHaveBeenCalled());
    expect(vi.mocked(updateBookmarkApi).mock.calls[0]?.[0]).toEqual({
      id: bookmark.id,
      input: {
        url: 'https://new.example',
        title: bookmark.title,
        tags: bookmark.tags,
        description: bookmark.description,
      },
    });
  });

  it('disables saving when the URL is empty', () => {
    renderDialog();

    fireEvent.change(screen.getByLabelText('URL'), { target: { value: '   ' } });

    expect(screen.getByRole('button', { name: '保存' })).toBeDisabled();
  });

  it('closes and invalidates bookmark queries after a successful update', async () => {
    vi.mocked(updateBookmarkApi).mockResolvedValue({
      ...bookmark,
      url: 'https://new.example',
    });
    const { invalidateQueries, setEditTarget } = renderDialog();

    fireEvent.click(screen.getByRole('button', { name: '保存' }));

    await waitFor(() => expect(setEditTarget).toHaveBeenCalledWith(null));
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ['bookmarks'] });
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ['tags'] });
  });

  it('keeps the dialog open and shows an update error for a duplicate URL', async () => {
    vi.mocked(updateBookmarkApi).mockRejectedValue(
      new Error('A bookmark with this URL already exists'),
    );
    const { setEditTarget } = renderDialog();

    fireEvent.click(screen.getByRole('button', { name: '保存' }));

    expect(
      await screen.findByText('更新失败：A bookmark with this URL already exists'),
    ).toBeTruthy();
    expect(setEditTarget).not.toHaveBeenCalled();
  });
});
