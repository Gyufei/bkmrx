// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import AddBookmarkDialog from './AddBookmarkDialog';
import { addBookmarkApi } from './bookmarks.api';

vi.mock('./bookmarks.api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./bookmarks.api')>();
  return {
    ...actual,
    addBookmarkApi: vi.fn(),
  };
});

vi.mock('@/components/TagInput', () => ({
  default: () => <div>标签输入框</div>,
}));

function renderDialog(onOpenChange = vi.fn()) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  const invalidateQueries = vi.spyOn(queryClient, 'invalidateQueries');

  render(
    <QueryClientProvider client={queryClient}>
      <AddBookmarkDialog open onOpenChange={onOpenChange} />
    </QueryClientProvider>,
  );

  return { invalidateQueries, onOpenChange };
}

beforeEach(() => {
  vi.mocked(addBookmarkApi).mockReset();
});

afterEach(cleanup);

describe('AddBookmarkDialog', () => {
  it('keeps the create mutation in the dialog container', async () => {
    vi.mocked(addBookmarkApi).mockResolvedValue({
      id: 1,
      url: 'https://example.com',
      title: '',
      tags: [],
      description: '',
      access_count: 0,
      created_at: '2026-08-17T00:00:00Z',
      updated_at: '2026-08-17T00:00:00Z',
      accessed_at: null,
      starred_at: null,
    });
    const { invalidateQueries, onOpenChange } = renderDialog();

    fireEvent.change(screen.getByLabelText('URL'), {
      target: { value: ' https://example.com ' },
    });
    fireEvent.click(screen.getByRole('button', { name: '添加' }));

    await waitFor(() => expect(addBookmarkApi).toHaveBeenCalled());
    expect(vi.mocked(addBookmarkApi).mock.calls[0]?.[0]).toEqual({
      url: 'https://example.com',
      title: '',
      tags: [],
      description: '',
    });
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(invalidateQueries).toHaveBeenCalledWith({ predicate: expect.any(Function) });
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ['tags'] });
  });

  it('keeps the dialog open and shows create errors', async () => {
    vi.mocked(addBookmarkApi).mockRejectedValue(new Error('duplicate URL'));
    const { onOpenChange } = renderDialog();

    fireEvent.change(screen.getByLabelText('URL'), {
      target: { value: 'https://example.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: '添加' }));

    expect(await screen.findByText('添加失败：duplicate URL')).toBeInTheDocument();
    expect(onOpenChange).not.toHaveBeenCalled();
  });
});
