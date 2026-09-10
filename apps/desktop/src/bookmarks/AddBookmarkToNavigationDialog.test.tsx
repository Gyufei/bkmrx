// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { bookmarkId, navigationCategoryId, navigationPlacementId } from '@/test-utils/identity';
import type { Bookmark, NavigationSection } from '@/types';
import AddBookmarkToNavigationDialog from './AddBookmarkToNavigationDialog';

const mocks = vi.hoisted(() => ({
  list: vi.fn(),
  add: vi.fn(),
  invalidate: vi.fn(),
  toast: vi.fn(),
}));

vi.mock('@/navigation/navigation.api', () => ({
  NAVIGATION_SECTIONS_KEY: ['navigation-sections'],
  listNavigationSectionsApi: mocks.list,
  addNavigationBookmarksApi: mocks.add,
  invalidateNavigationSections: mocks.invalidate,
}));
vi.mock('@/components/ui/toast', () => ({ toast: { add: mocks.toast } }));

const bookmark: Bookmark = {
  id: bookmarkId(1),
  url: 'https://example.com',
  title: 'Example',
  description: '',
  tags: [],
  access_count: 0,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  accessed_at: null,
  starred_at: null,
};

function section(assigned: boolean, sequence = 1, name = '工具'): NavigationSection {
  return {
    category: {
      id: navigationCategoryId(sequence),
      name,
      order: sequence - 1,
      created_at: 1,
      updated_at: 1,
    },
    cards: assigned
      ? [
          {
            placement_id: navigationPlacementId(1),
            bookmark_id: bookmark.id,
            title: bookmark.title,
            url: bookmark.url,
            created_at: 1,
          },
        ]
      : [],
  };
}

function renderDialog(onOpenChange = vi.fn()) {
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <AddBookmarkToNavigationDialog bookmark={bookmark} onOpenChange={onOpenChange} />
    </QueryClientProvider>,
  );
  return onOpenChange;
}

describe('AddBookmarkToNavigationDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.invalidate.mockResolvedValue(undefined);
  });
  afterEach(cleanup);

  it('adds the bookmark to the selected category and closes', async () => {
    mocks.list.mockResolvedValue([section(false)]);
    mocks.add.mockResolvedValue([]);
    const onOpenChange = renderDialog();
    fireEvent.click(await screen.findByRole('radio', { name: '工具' }));
    fireEvent.click(screen.getByRole('button', { name: '确定' }));
    await waitFor(() =>
      expect(mocks.add).toHaveBeenCalledWith(navigationCategoryId(1), [bookmark.id]),
    );
    expect(mocks.invalidate).toHaveBeenCalled();
    expect(mocks.toast).toHaveBeenCalledWith(
      expect.objectContaining({ title: '已添加到导航分类' }),
    );
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('rejects an already assigned category when confirming', async () => {
    mocks.list.mockResolvedValue([section(true)]);
    renderDialog();
    fireEvent.click(await screen.findByRole('radio', { name: '工具' }));
    fireEvent.click(screen.getByRole('button', { name: '确定' }));
    expect(await screen.findByText('“Example”已在“工具”分类中')).toBeVisible();
    expect(mocks.add).not.toHaveBeenCalled();
  });

  it('lays category choices out inline and wraps when space is limited', async () => {
    mocks.list.mockResolvedValue([
      section(false, 1, '工具'),
      section(false, 2, '博客'),
      section(false, 3, '导航站'),
    ]);
    renderDialog();

    const group = await screen.findByRole('radiogroup', { name: '导航分类' });
    expect(group).toHaveClass('flex-row', 'flex-wrap', 'gap-2');
    expect(group).not.toHaveClass('overflow-y-auto');
    expect(screen.getByRole('radio', { name: '工具' }).closest('[data-slot="field"]')).toHaveClass(
      'w-auto',
    );
  });
});
