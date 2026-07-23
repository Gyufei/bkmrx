// @vitest-environment jsdom

import { render } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

import type { Bookmark } from '@/types';
import ResultList from './ResultList';

vi.mock('@tauri-apps/plugin-shell', () => ({ open: vi.fn() }));
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
  vi.stubGlobal('IntersectionObserver', IntersectionObserverMock);
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
    />,
  );

  intersectionCallback(
    [{ isIntersecting: true } as IntersectionObserverEntry],
    {} as IntersectionObserver,
  );

  expect(onLoadMore).not.toHaveBeenCalled();
});
