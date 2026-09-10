// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { bookmarkId, navigationCategoryId, navigationPlacementId } from '@/test-utils/identity';
import type { NavigationCategory } from '@/types';
import NavigationPage from './NavigationPage';

let categories: NavigationCategory[];
const mocks = vi.hoisted(() => ({
  list: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  remove: vi.fn(),
  addBookmarks: vi.fn(),
  removeBookmark: vi.fn(),
  open: vi.fn(),
  recordAccess: vi.fn(),
  queryBookmarks: vi.fn(),
  toastAdd: vi.fn(),
  toastClose: vi.fn(),
}));

vi.mock('@tauri-apps/plugin-shell', () => ({ open: mocks.open }));
vi.mock('@/lib/invoke', () => ({
  invokeRecordBookmarkAccess: mocks.recordAccess,
  invokeQueryBookmarks: mocks.queryBookmarks,
}));
vi.mock('@/components/ui/toast', () => ({
  toast: { add: mocks.toastAdd, close: mocks.toastClose },
}));

vi.mock('./navigation.api', () => ({
  NAVIGATION_CATEGORIES_KEY: ['navigation-categories'],
  listNavigationCategoriesApi: mocks.list,
  createNavigationCategoryApi: mocks.create,
  updateNavigationCategoryApi: mocks.update,
  deleteNavigationCategoryApi: mocks.remove,
  addNavigationBookmarksApi: mocks.addBookmarks,
  removeNavigationBookmarkApi: mocks.removeBookmark,
  invalidateNavigationCategories: (client: QueryClient) =>
    client.invalidateQueries({ queryKey: ['navigation-categories'] }),
}));

function renderPage() {
  return render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <NavigationPage />
    </QueryClientProvider>,
  );
}

describe('NavigationPage category lifecycle', () => {
  beforeEach(() => {
    categories = [];
    vi.clearAllMocks();
    mocks.list.mockImplementation(async () => categories);
    mocks.toastAdd.mockReturnValue('toast-1');
    mocks.open.mockResolvedValue(undefined);
    mocks.recordAccess.mockResolvedValue(undefined);
    mocks.queryBookmarks.mockResolvedValue({ items: [], next_cursor: null });
    mocks.create.mockImplementation(async (name: string) => {
      const category = {
        id: navigationCategoryId(1),
        name: name.trim(),
        order: categories.length,
        created_at: 1,
        updated_at: 1,
        bookmarks: [],
      };
      categories = [...categories, category];
      return category;
    });
    mocks.update.mockImplementation(async (id: NavigationCategory['id'], name: string) => {
      categories = categories.map((category) =>
        category.id === id ? { ...category, name: name.trim() } : category,
      );
      return categories.find((category) => category.id === id)!;
    });
    mocks.remove.mockImplementation(async (id: NavigationCategory['id']) => {
      categories = categories.filter((category) => category.id !== id);
    });
  });

  it('adds existing bookmarks, opens cards, removes placements, and offers undo', async () => {
    const bookmark = {
      id: bookmarkId(1),
      url: 'https://example.com/docs',
      title: 'Example Docs',
      description: '',
      tags: [],
      access_count: 0,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
      accessed_at: null,
      starred_at: null,
    };
    const placed = {
      placement_id: navigationPlacementId(1),
      id: bookmark.id,
      title: bookmark.title,
      url: bookmark.url,
      created_at: 1,
    };
    categories = [
      {
        id: navigationCategoryId(1),
        name: '工具',
        order: 0,
        created_at: 1,
        updated_at: 1,
        bookmarks: [],
      },
    ];
    mocks.queryBookmarks.mockResolvedValue({ items: [bookmark], next_cursor: null });
    mocks.addBookmarks.mockImplementation(async () => {
      categories = [{ ...categories[0], bookmarks: [placed] }];
      return [placed];
    });
    mocks.removeBookmark.mockImplementation(async () => {
      categories = [{ ...categories[0], bookmarks: [] }];
    });

    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: /添加书签/ }));
    fireEvent.click(await screen.findByText('Example Docs'));
    fireEvent.click(screen.getByRole('button', { name: '添加（1）' }));
    expect(await screen.findByRole('button', { name: 'Example Docs' })).toBeVisible();

    fireEvent.click(screen.getByRole('button', { name: 'Example Docs' }));
    await waitFor(() => expect(mocks.open).toHaveBeenCalledWith(bookmark.url));
    expect(mocks.recordAccess).toHaveBeenCalledWith(bookmark.id);

    fireEvent.click(screen.getByRole('button', { name: '从分类移除 Example Docs' }));
    await waitFor(() =>
      expect(mocks.removeBookmark).toHaveBeenCalledWith(categories[0].id, bookmark.id),
    );
    const notice = mocks.toastAdd.mock.calls.find(([value]) => value.title === '已从分类移除')?.[0];
    expect(notice.actionProps.children).toBe('撤销');
    notice.actionProps.onClick();
    expect(mocks.addBookmarks).toHaveBeenLastCalledWith(categories[0].id, [bookmark.id]);
  });
  afterEach(cleanup);

  it('shows empty states and supports create, rename, and confirmed delete', async () => {
    renderPage();
    expect(await screen.findByText('还没有导航分类，先创建一个常用分类吧。')).toBeVisible();
    fireEvent.change(screen.getByRole('textbox', { name: '分类名称' }), {
      target: { value: ' 工具 ' },
    });
    fireEvent.click(screen.getByRole('button', { name: /新建分类/ }));
    expect(await screen.findByRole('heading', { name: '工具' })).toBeVisible();
    expect(screen.getByText('该分类暂无书签')).toBeVisible();

    fireEvent.click(screen.getByRole('button', { name: '重命名 工具' }));
    fireEvent.change(screen.getByRole('textbox', { name: '重命名 工具' }), {
      target: { value: '常用工具' },
    });
    fireEvent.click(screen.getByRole('button', { name: '保存' }));
    expect(await screen.findByRole('heading', { name: '常用工具' })).toBeVisible();

    fireEvent.click(screen.getByRole('button', { name: '删除 常用工具' }));
    expect(screen.getByText('只会删除分类及其中的导航关联，不会删除任何书签。')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: '删除' }));
    await waitFor(() => expect(mocks.remove).toHaveBeenCalledOnce());
    expect(await screen.findByText('还没有导航分类，先创建一个常用分类吧。')).toBeVisible();
  });
});
