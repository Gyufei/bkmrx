// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import type { Bookmark } from '@/types';
import ResultList from './ResultList';

const toastAddMock = vi.hoisted(() => vi.fn());
const toastCloseMock = vi.hoisted(() => vi.fn());

vi.mock('@/components/ui/toast', () => ({
  toast: { add: toastAddMock, close: toastCloseMock },
}));
vi.mock('./DeleteBkDialog', () => ({ default: () => null }));
vi.mock('./EditBookmarkDialog', () => ({ default: () => null }));

let intersectionCallback: IntersectionObserverCallback;

class IntersectionObserverMock {
  constructor(callback: IntersectionObserverCallback) {
    intersectionCallback = callback;
  }
  observe() {}
  disconnect() {}
  unobserve() {}
  takeRecords() {
    return [];
  }
  root = null;
  rootMargin = '';
  thresholds = [];
}

beforeEach(() => {
  toastAddMock.mockReset();
  toastCloseMock.mockReset();
  vi.stubGlobal('IntersectionObserver', IntersectionObserverMock);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

it('waits for explicit retry after a next-page failure', () => {
  const onLoadMore = vi.fn();
  const bookmark: Bookmark = {
    id: 1,
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
  render(
    <ResultList
      bookmarks={[bookmark]}
      initialLoading={false}
      initialError={null}
      hasMore
      isFetchingNextPage={false}
      nextPageError="下一页失败"
      onLoadMore={onLoadMore}
      onRetryNextPage={vi.fn()}
      starredView={false}
      emptyMessage="暂无匹配的书签"
      starPendingId={null}
      onToggleStarred={vi.fn()}
      onPreviewBookmark={vi.fn()}
      onOpenBookmark={vi.fn()}
      activeBookmarkId={bookmark.id}
      onActiveBookmarkChange={vi.fn()}
      onBookmarkElementChange={vi.fn()}
      onInteractionLockChange={vi.fn()}
    />,
  );

  intersectionCallback(
    [{ isIntersecting: true } as IntersectionObserverEntry],
    {} as IntersectionObserver,
  );

  expect(onLoadMore).not.toHaveBeenCalled();
});

function renderList({
  bookmark,
  starredView,
  onToggleStarred,
  onPreviewBookmark = vi.fn(),
  onOpenBookmark = vi.fn(),
  activeBookmarkId = null,
  onActiveBookmarkChange = vi.fn(),
  onInteractionLockChange = vi.fn(),
}: {
  bookmark: Bookmark;
  starredView: boolean;
  onToggleStarred: (bookmark: Bookmark, starred: boolean) => void;
  onPreviewBookmark?: (bookmark: Bookmark, trigger: HTMLElement) => void;
  onOpenBookmark?: (bookmark: Bookmark) => void;
  activeBookmarkId?: number | null;
  onActiveBookmarkChange?: (id: number) => void;
  onInteractionLockChange?: (locked: boolean) => void;
}) {
  return render(
    <ResultList
      bookmarks={[bookmark]}
      initialLoading={false}
      initialError={null}
      hasMore={false}
      isFetchingNextPage={false}
      nextPageError={null}
      onLoadMore={vi.fn()}
      onRetryNextPage={vi.fn()}
      starredView={starredView}
      emptyMessage="空"
      starPendingId={null}
      onToggleStarred={onToggleStarred}
      onPreviewBookmark={onPreviewBookmark}
      onOpenBookmark={onOpenBookmark}
      activeBookmarkId={activeBookmarkId}
      onActiveBookmarkChange={onActiveBookmarkChange}
      onBookmarkElementChange={vi.fn()}
      onInteractionLockChange={onInteractionLockChange}
    />,
  );
}

it('previews a bookmark from card content but opens only the title externally', () => {
  const bookmark: Bookmark = {
    id: 1,
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
  const onPreviewBookmark = vi.fn();
  const onOpenBookmark = vi.fn();
  renderList({
    bookmark,
    starredView: false,
    onToggleStarred: vi.fn(),
    onPreviewBookmark,
    onOpenBookmark,
  });

  fireEvent.click(screen.getByText(bookmark.url));
  expect(onPreviewBookmark).toHaveBeenCalledWith(bookmark, expect.any(HTMLElement));

  fireEvent.click(screen.getByRole('button', { name: bookmark.title }));
  expect(onOpenBookmark).toHaveBeenCalledOnce();
  expect(onOpenBookmark).toHaveBeenCalledWith(bookmark);
  expect(onPreviewBookmark).toHaveBeenCalledOnce();
});

it('stars a bookmark from an independent accessible card button', () => {
  const onToggleStarred = vi.fn();
  const bookmark: Bookmark = {
    id: 1,
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
  renderList({ bookmark, starredView: false, onToggleStarred });

  fireEvent.click(screen.getByRole('button', { name: '添加星标' }));

  expect(onToggleStarred).toHaveBeenCalledWith(bookmark, true);
});

it('immediately unstars in the default starred view and offers undo', () => {
  const onToggleStarred = vi.fn();
  toastAddMock.mockReturnValue('toast-1');
  const bookmark: Bookmark = {
    id: 1,
    url: 'https://example.com',
    title: 'Example',
    description: '',
    tags: [],
    access_count: 0,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    accessed_at: null,
    starred_at: '2026-01-02T00:00:00Z',
  };
  renderList({ bookmark, starredView: true, onToggleStarred });

  fireEvent.click(screen.getByRole('button', { name: '取消星标' }));
  expect(onToggleStarred).toHaveBeenCalledWith(bookmark, false);
  expect(toastAddMock).toHaveBeenCalledWith(
    expect.objectContaining({
      title: '已取消星标',
      description: '“Example”已从星标列表移除',
      actionProps: expect.objectContaining({ children: '撤销' }),
    }),
  );

  const { actionProps } = toastAddMock.mock.calls[0][0];
  actionProps.onClick();

  expect(onToggleStarred).toHaveBeenLastCalledWith(bookmark, true);
  expect(toastCloseMock).toHaveBeenCalledWith('toast-1');
});

it('unstars without an undo toast in search or tag results', () => {
  const onToggleStarred = vi.fn();
  const bookmark: Bookmark = {
    id: 1,
    url: 'https://example.com',
    title: 'Example',
    description: '',
    tags: [],
    access_count: 0,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    accessed_at: null,
    starred_at: '2026-01-02T00:00:00Z',
  };
  renderList({ bookmark, starredView: false, onToggleStarred });

  fireEvent.click(screen.getByRole('button', { name: '取消星标' }));

  expect(onToggleStarred).toHaveBeenCalledWith(bookmark, false);
  expect(toastAddMock).not.toHaveBeenCalled();
});

it('disables the star button while that bookmark is updating', () => {
  const bookmark: Bookmark = {
    id: 1,
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
  render(
    <ResultList
      bookmarks={[bookmark]}
      initialLoading={false}
      initialError={null}
      hasMore={false}
      isFetchingNextPage={false}
      nextPageError={null}
      onLoadMore={vi.fn()}
      onRetryNextPage={vi.fn()}
      starredView={false}
      emptyMessage="空"
      starPendingId={bookmark.id}
      onToggleStarred={vi.fn()}
      onPreviewBookmark={vi.fn()}
      onOpenBookmark={vi.fn()}
      activeBookmarkId={bookmark.id}
      onActiveBookmarkChange={vi.fn()}
      onBookmarkElementChange={vi.fn()}
      onInteractionLockChange={vi.fn()}
    />,
  );

  expect((screen.getByRole('button', { name: '添加星标' }) as HTMLButtonElement).disabled).toBe(
    true,
  );
});

it('locks page shortcuts while a bookmark dialog target is active', () => {
  const bookmark: Bookmark = {
    id: 1,
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
  const onInteractionLockChange = vi.fn();
  renderList({
    bookmark,
    starredView: false,
    onToggleStarred: vi.fn(),
    onInteractionLockChange,
  });

  fireEvent.click(screen.getByTitle('删除书签'));

  expect(onInteractionLockChange).toHaveBeenLastCalledWith(true);
});

it('distinguishes the active bookmark from the lighter hover state', () => {
  const bookmark: Bookmark = {
    id: 1,
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
  const onActiveBookmarkChange = vi.fn();
  const { rerender } = renderList({
    bookmark,
    starredView: false,
    onToggleStarred: vi.fn(),
    activeBookmarkId: null,
    onActiveBookmarkChange,
  });

  const row = screen.getByText(bookmark.url).parentElement as HTMLElement;
  expect(row.className).toContain('hover:bg-accent/40');
  expect(row.getAttribute('aria-current')).toBeNull();

  fireEvent.click(row);
  expect(onActiveBookmarkChange).toHaveBeenCalledWith(bookmark.id);

  rerender(
    <ResultList
      bookmarks={[bookmark]}
      initialLoading={false}
      initialError={null}
      hasMore={false}
      isFetchingNextPage={false}
      nextPageError={null}
      onLoadMore={vi.fn()}
      onRetryNextPage={vi.fn()}
      starredView={false}
      emptyMessage="空"
      starPendingId={null}
      onToggleStarred={vi.fn()}
      onPreviewBookmark={vi.fn()}
      onOpenBookmark={vi.fn()}
      activeBookmarkId={bookmark.id}
      onActiveBookmarkChange={vi.fn()}
      onBookmarkElementChange={vi.fn()}
      onInteractionLockChange={vi.fn()}
    />,
  );

  const activeRow = screen.getByText(bookmark.url).parentElement as HTMLElement;
  expect(activeRow.className).toContain('bg-accent');
  expect(activeRow.className).not.toContain('hover:bg-accent/40');
  expect(activeRow.getAttribute('aria-current')).toBe('true');
});
