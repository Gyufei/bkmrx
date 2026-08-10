// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import TagInput from './TagInput';

const getTagsMock = vi.hoisted(() => vi.fn());

vi.mock('@/bookmarks/bookmarks.api', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/bookmarks/bookmarks.api')>();
  return {
    ...original,
    getTagsApi: getTagsMock,
  };
});

function renderInput() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <TagInput value={[]} onChange={() => {}} />
    </QueryClientProvider>,
  );
}

function renderWithSuggestions() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <TagInput value={[]} onChange={() => {}} suggestions={['待办', '稍后']} />
    </QueryClientProvider>,
  );
}

describe('TagInput', () => {
  beforeEach(() => {
    getTagsMock.mockReset();
  });

  afterEach(cleanup);

  it('requests all tags and exposes suggestions beyond the first fifty', async () => {
    getTagsMock.mockResolvedValue(
      Array.from({ length: 51 }, (_, index) => ({ name: `tag${index}`, count: 1 })),
    );
    renderInput();

    fireEvent.focus(screen.getByPlaceholderText('输入标签，回车添加'));

    expect(await screen.findByText('tag50')).toBeTruthy();
    expect(getTagsMock).toHaveBeenCalledWith({ query: '', limit: null });
  });

  it('uses supplied suggestions without requesting bookmark tags', async () => {
    renderWithSuggestions();

    fireEvent.focus(screen.getByPlaceholderText('输入标签，回车添加'));

    expect(await screen.findByText('待办')).toBeTruthy();
    expect(screen.getByText('稍后')).toBeTruthy();
    expect(getTagsMock).not.toHaveBeenCalled();
  });
});
