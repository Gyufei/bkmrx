// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import type { Bookmark } from '@/types';
import ResultList from './ResultList';

const openMock = vi.hoisted(() => vi.fn());
const toastAddMock = vi.hoisted(() => vi.fn());
const toastCloseMock = vi.hoisted(() => vi.fn());

vi.mock('@tauri-apps/plugin-shell', () => ({ open: openMock }));
vi.mock('@/components/ui/toast', () => ({
  toast: { add: toastAddMock, close: toastCloseMock },
}));
vi.mock('../lib/invoke', () => ({ invokeRecordBookmarkAccess: vi.fn() }));
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
  openMock.mockReset();
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
}: {
  bookmark: Bookmark;
  starredView: boolean;
  onToggleStarred: (bookmark: Bookmark, starred: boolean) => void;
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
    />,
  );
}

it('opens a bookmark only when its title is clicked', () => {
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
  renderList({ bookmark, starredView: false, onToggleStarred: vi.fn() });

  fireEvent.click(screen.getByText(bookmark.url));
  expect(openMock).not.toHaveBeenCalled();

  fireEvent.click(screen.getByRole('button', { name: bookmark.title }));
  expect(openMock).toHaveBeenCalledOnce();
  expect(openMock).toHaveBeenCalledWith(bookmark.url);
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
  expect(openMock).not.toHaveBeenCalled();
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
  expect(openMock).not.toHaveBeenCalled();
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
    />,
  );

  expect(
    (screen.getByRole('button', { name: '添加星标' }) as HTMLButtonElement).disabled,
  ).toBe(true);
});
