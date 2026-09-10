// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { bookmarkId, navigationCategoryId, navigationPlacementId } from '@/test-utils/identity';
import type { NavigationCategory, NavigationSection } from '@/types';
import NavigationPage from './NavigationPage';

let sections: NavigationSection[];
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
  NAVIGATION_SECTIONS_KEY: ['navigation-sections'],
  listNavigationSectionsApi: mocks.list,
  createNavigationCategoryApi: mocks.create,
  updateNavigationCategoryApi: mocks.update,
  deleteNavigationCategoryApi: mocks.remove,
  addNavigationBookmarksApi: mocks.addBookmarks,
  removeNavigationBookmarkApi: mocks.removeBookmark,
  invalidateNavigationSections: (client: QueryClient) =>
    client.invalidateQueries({ queryKey: ['navigation-sections'] }),
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

async function enterEditMode() {
  fireEvent.click(await screen.findByRole('button', { name: '编辑' }));
  expect(await screen.findByRole('button', { name: '查看' })).toBeVisible();
}

describe('NavigationPage category lifecycle', () => {
  beforeEach(() => {
    sections = [];
    vi.clearAllMocks();
    mocks.list.mockImplementation(async () => sections);
    mocks.toastAdd.mockReturnValue('toast-1');
    mocks.open.mockResolvedValue(undefined);
    mocks.recordAccess.mockResolvedValue(undefined);
    mocks.queryBookmarks.mockResolvedValue({ items: [], next_cursor: null });
    mocks.create.mockImplementation(async (name: string) => {
      const category = {
        id: navigationCategoryId(1),
        name: name.trim(),
        order: sections.length,
        created_at: 1,
        updated_at: 1,
      };
      sections = [...sections, { category, cards: [] }];
      return category;
    });
    mocks.update.mockImplementation(async (id: NavigationCategory['id'], name: string) => {
      sections = sections.map((section) =>
        section.category.id === id
          ? { ...section, category: { ...section.category, name: name.trim() } }
          : section,
      );
      return sections.find((section) => section.category.id === id)!.category;
    });
    mocks.remove.mockImplementation(async (id: NavigationCategory['id']) => {
      sections = sections.filter((section) => section.category.id !== id);
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
      bookmark_id: bookmark.id,
      title: bookmark.title,
      url: bookmark.url,
      created_at: 1,
    };
    sections = [
      {
        category: {
          id: navigationCategoryId(1),
          name: '工具',
          order: 0,
          created_at: 1,
          updated_at: 1,
        },
        cards: [],
      },
    ];
    mocks.queryBookmarks.mockResolvedValue({ items: [bookmark], next_cursor: null });
    mocks.addBookmarks.mockImplementation(async () => {
      sections = [{ ...sections[0], cards: [placed] }];
      return [placed];
    });
    mocks.removeBookmark.mockImplementation(async () => {
      sections = [{ ...sections[0], cards: [] }];
    });

    renderPage();
    await enterEditMode();
    fireEvent.click(await screen.findByRole('button', { name: /添加书签/ }));
    fireEvent.click(await screen.findByText('Example Docs'));
    fireEvent.click(screen.getByRole('button', { name: '添加（1）' }));
    expect(await screen.findByRole('button', { name: 'Example Docs' })).toBeVisible();

    fireEvent.click(screen.getByRole('button', { name: /添加书签/ }));
    expect(await screen.findByText('已添加')).toBeVisible();
    expect(screen.getByRole('checkbox')).toHaveAttribute('aria-disabled', 'true');
    fireEvent.click(screen.getByRole('button', { name: '取消' }));

    fireEvent.click(screen.getByRole('button', { name: 'Example Docs' }));
    await waitFor(() => expect(mocks.open).toHaveBeenCalledWith(bookmark.url));
    expect(mocks.recordAccess).toHaveBeenCalledWith(bookmark.id);

    fireEvent.click(screen.getByRole('button', { name: '从分类移除 Example Docs' }));
    await waitFor(() =>
      expect(mocks.removeBookmark).toHaveBeenCalledWith(sections[0].category.id, bookmark.id),
    );
    const notice = mocks.toastAdd.mock.calls.find(([value]) => value.title === '已从分类移除')?.[0];
    expect(notice.actionProps.children).toBe('撤销');
    notice.actionProps.onClick();
    expect(mocks.addBookmarks).toHaveBeenLastCalledWith(sections[0].category.id, [bookmark.id]);
  });
  afterEach(cleanup);

  it('opens cards in view mode and hides management until edit is enabled', async () => {
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
    sections = [
      {
        category: {
          id: navigationCategoryId(1),
          name: '工具',
          order: 0,
          created_at: 1,
          updated_at: 1,
        },
        cards: [
          {
            placement_id: navigationPlacementId(1),
            bookmark_id: bookmark.id,
            title: bookmark.title,
            url: bookmark.url,
            created_at: 1,
          },
        ],
      },
    ];

    renderPage();
    expect(await screen.findByRole('heading', { name: '工具' })).toBeVisible();
    expect(screen.queryByRole('textbox', { name: '分类名称' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /新建分类/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /添加书签/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '重命名 工具' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '删除 工具' })).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: '从分类移除 Example Docs' }),
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Example Docs' }));
    await waitFor(() => expect(mocks.open).toHaveBeenCalledWith(bookmark.url));

    await enterEditMode();
    expect(screen.queryByRole('textbox', { name: '分类名称' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '新建分类' })).toHaveClass('h-[82px]');
    expect(screen.getByRole('button', { name: /添加书签/ })).toBeVisible();
    expect(screen.getByRole('button', { name: '重命名 工具' })).toBeVisible();
    expect(screen.getByRole('button', { name: '删除 工具' })).toBeVisible();
    expect(screen.getByRole('button', { name: '从分类移除 Example Docs' })).toBeVisible();

    fireEvent.click(screen.getByRole('button', { name: '查看' }));
    expect(await screen.findByRole('button', { name: '编辑' })).toBeVisible();
    expect(screen.queryByRole('button', { name: '新建分类' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /添加书签/ })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Example Docs' })).toBeVisible();
  });

  it('shows empty states and supports create, rename, and confirmed delete', async () => {
    renderPage();
    expect(await screen.findByText(/还没有导航分类，先/)).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: '创建' }));
    expect(screen.getByRole('heading', { name: '新建分类' })).toBeVisible();
    fireEvent.change(screen.getByRole('textbox', { name: '分类名称' }), {
      target: { value: ' 工具 ' },
    });
    fireEvent.click(screen.getByRole('button', { name: '确定' }));
    expect(await screen.findByRole('heading', { name: '工具' })).toBeVisible();
    expect(screen.getByText('该分类暂无书签')).toHaveClass('h-7');

    await enterEditMode();
    fireEvent.click(screen.getByRole('button', { name: '重命名 工具' }));
    expect(screen.getByRole('heading', { name: '编辑分类' })).toBeVisible();
    fireEvent.change(screen.getByRole('textbox', { name: '分类名称' }), {
      target: { value: '常用工具' },
    });
    fireEvent.click(screen.getByRole('button', { name: '确定' }));
    expect(await screen.findByRole('heading', { name: '常用工具' })).toBeVisible();

    fireEvent.click(screen.getByRole('button', { name: '删除 常用工具' }));
    expect(screen.getByText('将删除“常用工具”及其中 0 个导航关联，不会删除书签。')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: '删除' }));
    await waitFor(() => expect(mocks.remove).toHaveBeenCalledOnce());
    expect(await screen.findByRole('button', { name: '新建分类' })).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: '查看' }));
    expect(await screen.findByRole('button', { name: '创建' })).toBeVisible();
    expect(screen.getByText(/还没有导航分类，先/)).toBeVisible();
  });
});
