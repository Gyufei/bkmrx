// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import type { Bookmark } from '@/types';
import ResultList from './ResultList';

const openMock = vi.hoisted(() => vi.fn());

vi.mock('@tauri-apps/plugin-shell', () => ({ open: openMock }));
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
      onToggleStarred={onToggleStarred}
    />,
  );
}

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

it('confirms before unstar in the default starred view', () => {
  const onToggleStarred = vi.fn();
  const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
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
  expect(confirm).toHaveBeenCalledWith('取消星标后，该书签将不再显示在默认列表中。');
  expect(onToggleStarred).not.toHaveBeenCalled();

  confirm.mockReturnValue(true);
  fireEvent.click(screen.getByRole('button', { name: '取消星标' }));
  expect(onToggleStarred).toHaveBeenCalledWith(bookmark, false);
});

it('does not confirm before unstar in search or tag results', () => {
  const onToggleStarred = vi.fn();
  const confirm = vi.spyOn(window, 'confirm');
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

  expect(confirm).not.toHaveBeenCalled();
  expect(onToggleStarred).toHaveBeenCalledWith(bookmark, false);
});
