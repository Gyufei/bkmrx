// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { PropsWithChildren } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { bookmarkId, navigationCategoryId, navigationPlacementId } from '@/test-utils/identity';
import type { NavigationSection } from '@/types';
import { useNavigationController } from './use-navigation-controller';

const mocks = vi.hoisted(() => ({
  list: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  removeCategory: vi.fn(),
  reorder: vi.fn(),
  addBookmarks: vi.fn(),
  removeBookmark: vi.fn(),
  openBookmark: vi.fn(),
  toastAdd: vi.fn(),
  toastClose: vi.fn(),
  invalidate: vi.fn(),
}));

vi.mock('@/bookmarks/open-bookmark', () => ({ openBookmark: mocks.openBookmark }));
vi.mock('@/components/ui/toast', () => ({
  toast: { add: mocks.toastAdd, close: mocks.toastClose },
}));
vi.mock('./navigation.api', () => ({
  NAVIGATION_SECTIONS_KEY: ['navigation-sections'],
  listNavigationSectionsApi: mocks.list,
  createNavigationCategoryApi: mocks.create,
  updateNavigationCategoryApi: mocks.update,
  deleteNavigationCategoryApi: mocks.removeCategory,
  reorderNavigationCategoriesApi: mocks.reorder,
  addNavigationBookmarksApi: mocks.addBookmarks,
  removeNavigationBookmarkApi: mocks.removeBookmark,
  invalidateNavigationSections: mocks.invalidate,
}));

const section: NavigationSection = {
  category: {
    id: navigationCategoryId(1),
    name: '工具',
    order: 0,
    created_at: 1,
    updated_at: 1,
  },
  cards: [],
};

function wrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return function Wrapper({ children }: PropsWithChildren) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

describe('useNavigationController', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.list.mockResolvedValue([section]);
    mocks.toastAdd.mockReturnValue('toast-1');
    mocks.invalidate.mockResolvedValue(undefined);
  });

  it('presents Navigation Sections through a small load-state interface', async () => {
    const { result } = renderHook(() => useNavigationController(), { wrapper: wrapper() });

    expect(result.current.loadState).toBe('loading');
    expect(result.current.sections).toEqual([]);
    await waitFor(() => expect(result.current.loadState).toBe('ready'));
    expect(result.current.sections).toEqual([section]);
  });

  it('runs Category commands and returns an explicit success result', async () => {
    mocks.create.mockResolvedValue(section.category);
    const { result } = renderHook(() => useNavigationController(), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.loadState).toBe('ready'));

    await expect(result.current.category.create('文档')).resolves.toEqual({ ok: true });
    expect(mocks.create.mock.calls[0][0]).toBe('文档');
  });

  it('contains mutation failures and reports them through its interface', async () => {
    mocks.create.mockRejectedValue(new Error('duplicate'));
    const { result } = renderHook(() => useNavigationController(), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.loadState).toBe('ready'));

    await expect(result.current.category.create('工具')).resolves.toEqual({ ok: false });
    expect(mocks.toastAdd).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'error', title: 'duplicate' }),
    );
  });

  it('keeps adapter details behind grouped Category and Navigation Placement commands', async () => {
    const card = {
      placement_id: navigationPlacementId(1),
      bookmark_id: bookmarkId(1),
      title: '文档',
      url: 'https://example.com/docs',
      created_at: 1,
    };
    mocks.update.mockResolvedValue(section.category);
    mocks.removeCategory.mockResolvedValue(undefined);
    mocks.reorder.mockResolvedValue(undefined);
    mocks.addBookmarks.mockResolvedValue([card]);
    mocks.openBookmark.mockResolvedValue(undefined);
    const { result } = renderHook(() => useNavigationController(), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.loadState).toBe('ready'));

    await expect(result.current.category.rename(section.category.id, '常用')).resolves.toEqual({
      ok: true,
    });
    await expect(result.current.category.remove(section.category.id)).resolves.toEqual({
      ok: true,
    });
    await expect(result.current.category.reorder([section.category.id])).resolves.toEqual({
      ok: true,
    });
    await expect(
      result.current.placement.add(section.category.id, [card.bookmark_id]),
    ).resolves.toEqual({ ok: true });
    await expect(result.current.placement.open(card)).resolves.toEqual({ ok: true });

    expect(mocks.update.mock.calls[0].slice(0, 2)).toEqual([section.category.id, '常用']);
    expect(mocks.removeCategory.mock.calls[0][0]).toBe(section.category.id);
    expect(mocks.reorder.mock.calls[0][0]).toEqual([section.category.id]);
    expect(mocks.addBookmarks.mock.calls[0].slice(0, 2)).toEqual([
      section.category.id,
      [card.bookmark_id],
    ]);
    expect(mocks.openBookmark).toHaveBeenCalledWith({
      id: card.bookmark_id,
      url: card.url,
    });
  });

  it('owns Navigation Placement removal and undo', async () => {
    const card = {
      placement_id: navigationPlacementId(1),
      bookmark_id: bookmarkId(1),
      title: '文档',
      url: 'https://example.com/docs',
      created_at: 1,
    };
    mocks.removeBookmark.mockResolvedValue(undefined);
    mocks.addBookmarks.mockResolvedValue([card]);
    const { result } = renderHook(() => useNavigationController(), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.loadState).toBe('ready'));

    await act(() => result.current.placement.remove({ categoryId: section.category.id, card }));
    const notice = mocks.toastAdd.mock.calls.find(([value]) => value.title === '已从分类移除')?.[0];
    expect(notice.actionProps.children).toBe('撤销');
    act(() => notice.actionProps.onClick());
    await waitFor(() =>
      expect(
        mocks.addBookmarks.mock.calls[mocks.addBookmarks.mock.calls.length - 1]?.slice(0, 2),
      ).toEqual([section.category.id, [card.bookmark_id]]),
    );
    expect(mocks.toastClose).toHaveBeenCalledWith('toast-1');
  });
});
