// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { bookmarkId, navigationCategoryId, navigationPlacementId } from '@/test-utils/identity';
import type { NavigationSection } from '@/types';
import NavigationPage from './NavigationPage';

const mocks = vi.hoisted(() => ({
  controller: { current: null as unknown },
  create: vi.fn(),
  rename: vi.fn(),
  removeCategory: vi.fn(),
  reorder: vi.fn(),
  add: vi.fn(),
  removePlacement: vi.fn(),
  open: vi.fn(),
  queryBookmarks: vi.fn(),
}));

vi.mock('./use-navigation-controller', () => ({
  useNavigationController: () => mocks.controller.current,
}));
vi.mock('@/lib/invoke', () => ({ invokeQueryBookmarks: mocks.queryBookmarks }));

const section: NavigationSection = {
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
      bookmark_id: bookmarkId(1),
      title: 'Example Docs',
      url: 'https://example.com/docs',
      created_at: 1,
    },
  ],
};

function setController(sections: NavigationSection[] = [], loadState = 'ready') {
  mocks.controller.current = {
    sections,
    loadState,
    category: {
      create: mocks.create,
      rename: mocks.rename,
      remove: mocks.removeCategory,
      reorder: mocks.reorder,
      saving: false,
      deleting: false,
      reordering: false,
    },
    placement: {
      add: mocks.add,
      remove: mocks.removePlacement,
      open: mocks.open,
      adding: false,
      removing: null,
    },
  };
}

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
  fireEvent.click(screen.getByRole('button', { name: '编辑' }));
  expect(await screen.findByRole('button', { name: '查看' })).toBeVisible();
}

describe('NavigationPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    for (const command of [
      mocks.create,
      mocks.rename,
      mocks.removeCategory,
      mocks.reorder,
      mocks.add,
      mocks.removePlacement,
      mocks.open,
    ]) {
      command.mockResolvedValue({ ok: true });
    }
    mocks.queryBookmarks.mockResolvedValue({ items: [], next_cursor: null });
    setController();
  });

  afterEach(cleanup);

  it('renders load states from the workflow interface', () => {
    setController([], 'loading');
    const view = renderPage();
    expect(screen.getByText('正在加载导航分类…')).toBeVisible();
    setController([], 'error');
    view.rerender(
      <QueryClientProvider client={new QueryClient()}>
        <NavigationPage />
      </QueryClientProvider>,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('加载导航分类失败');
  });

  it('uses Navigation Placement commands without knowing their implementation', async () => {
    setController([section]);
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Example Docs' }));
    expect(mocks.open).toHaveBeenCalledWith(section.cards[0]);
    expect(screen.queryByRole('button', { name: /从分类移除/ })).not.toBeInTheDocument();
    await enterEditMode();
    fireEvent.click(screen.getByRole('button', { name: '从分类移除 Example Docs' }));
    expect(mocks.removePlacement).toHaveBeenCalledWith({
      categoryId: section.category.id,
      card: section.cards[0],
    });
  });

  it('closes Category dialogs only after successful workflow commands', async () => {
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: '创建' }));
    fireEvent.change(screen.getByRole('textbox', { name: '分类名称' }), {
      target: { value: '工具' },
    });
    fireEvent.click(screen.getByRole('button', { name: '确定' }));
    await waitFor(() => expect(mocks.create).toHaveBeenCalledWith('工具'));
    expect(screen.queryByRole('heading', { name: '新建分类' })).not.toBeInTheDocument();

    cleanup();
    setController([section]);
    renderPage();
    await enterEditMode();
    fireEvent.click(screen.getByRole('button', { name: '重命名 工具' }));
    fireEvent.change(screen.getByRole('textbox', { name: '分类名称' }), {
      target: { value: '常用工具' },
    });
    fireEvent.click(screen.getByRole('button', { name: '确定' }));
    await waitFor(() => expect(mocks.rename).toHaveBeenCalledWith(section.category.id, '常用工具'));
    fireEvent.click(screen.getByRole('button', { name: '删除 工具' }));
    fireEvent.click(screen.getByRole('button', { name: '删除' }));
    await waitFor(() => expect(mocks.removeCategory).toHaveBeenCalledWith(section.category.id));
  });

  it('keeps a Category dialog open when the workflow command fails', async () => {
    mocks.create.mockResolvedValue({ ok: false });
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: '创建' }));
    fireEvent.change(screen.getByRole('textbox', { name: '分类名称' }), {
      target: { value: '工具' },
    });
    fireEvent.click(screen.getByRole('button', { name: '确定' }));

    await waitFor(() => expect(mocks.create).toHaveBeenCalledWith('工具'));
    expect(screen.getByRole('heading', { name: '新建分类' })).toBeVisible();
    expect(screen.getByRole('textbox', { name: '分类名称' })).toHaveValue('工具');
  });

  it('submits Category order through the workflow interface', async () => {
    const sections = ['工具', '博客', '文档'].map((name, index) => ({
      category: { ...section.category, id: navigationCategoryId(index + 1), name, order: index },
      cards: [],
    }));
    setController(sections);
    renderPage();
    await enterEditMode();
    fireEvent.click(screen.getByRole('button', { name: '排序分类' }));
    const source = screen.getByRole('listitem', { name: '文档' });
    const target = screen.getByRole('listitem', { name: '工具' });
    fireEvent(
      source,
      new MouseEvent('pointerdown', {
        bubbles: true,
        button: 0,
        clientX: 20,
        clientY: 20,
      }),
    );
    fireEvent.pointerEnter(target, { pointerId: 1 });
    fireEvent.pointerUp(target, { pointerId: 1 });
    fireEvent.click(screen.getByRole('button', { name: '保存排序' }));
    await waitFor(() =>
      expect(mocks.reorder).toHaveBeenCalledWith([
        navigationCategoryId(3),
        navigationCategoryId(1),
        navigationCategoryId(2),
      ]),
    );
  });
});
