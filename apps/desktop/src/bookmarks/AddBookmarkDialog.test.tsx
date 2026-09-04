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

function renderDialog(
  onOpenChange = vi.fn(),
  props: Partial<React.ComponentProps<typeof AddBookmarkDialog>> = {},
) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  const invalidateQueries = vi.spyOn(queryClient, 'invalidateQueries');

  render(
    <QueryClientProvider client={queryClient}>
      <AddBookmarkDialog open onOpenChange={onOpenChange} {...props} />
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

  it('prefills supplied values and reports the created bookmark', async () => {
    const created = {
      id: 1,
      url: 'https://example.com/rss',
      title: 'RSS title',
      tags: [],
      description: 'RSS summary',
      access_count: 0,
      created_at: '2026-09-04T00:00:00Z',
      updated_at: '2026-09-04T00:00:00Z',
      accessed_at: null,
      starred_at: null,
    };
    vi.mocked(addBookmarkApi).mockResolvedValue(created);
    const onCreated = vi.fn();
    renderDialog(vi.fn(), {
      initialValues: {
        url: created.url,
        title: created.title,
        tags: [],
        description: created.description,
      },
      onCreated,
    });

    expect(screen.getByLabelText('URL')).toHaveValue(created.url);
    expect(screen.getByLabelText('标题（可选）')).toHaveValue(created.title);
    expect(screen.getByLabelText('描述（可选）')).toHaveValue(created.description);
    fireEvent.click(screen.getByRole('button', { name: '添加' }));

    await waitFor(() => expect(onCreated).toHaveBeenCalledWith(created));
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

  it('clears a previous create error when reopened', async () => {
    vi.mocked(addBookmarkApi).mockRejectedValue(new Error('duplicate URL'));
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    const view = render(
      <QueryClientProvider client={queryClient}>
        <AddBookmarkDialog open onOpenChange={vi.fn()} />
      </QueryClientProvider>,
    );

    fireEvent.change(screen.getByLabelText('URL'), {
      target: { value: 'https://example.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: '添加' }));
    expect(await screen.findByText('添加失败：duplicate URL')).toBeInTheDocument();

    view.rerender(
      <QueryClientProvider client={queryClient}>
        <AddBookmarkDialog open={false} onOpenChange={vi.fn()} />
      </QueryClientProvider>,
    );
    view.rerender(
      <QueryClientProvider client={queryClient}>
        <AddBookmarkDialog open onOpenChange={vi.fn()} />
      </QueryClientProvider>,
    );

    await waitFor(() => expect(screen.queryByText('添加失败：duplicate URL')).toBeNull());
  });
});
