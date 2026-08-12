// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Bookmark, BookmarkPage } from '@/types';
import BookmarkView from './BookmarkView';

const queryBookmarksMock = vi.hoisted(() => vi.fn());
const setBookmarkStarredMock = vi.hoisted(() => vi.fn());
const openMock = vi.hoisted(() => vi.fn());
const recordAccessMock = vi.hoisted(() => vi.fn());
const toastAddMock = vi.hoisted(() => vi.fn());

vi.mock('./bookmarks.api', async (importOriginal) => {
  const original = await importOriginal<typeof import('./bookmarks.api')>();
  return {
    ...original,
    queryBookmarksApi: queryBookmarksMock,
    setBookmarkStarredApi: setBookmarkStarredMock,
  };
});

vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn().mockResolvedValue(() => {}),
}));
vi.mock('@tauri-apps/plugin-shell', () => ({ open: openMock }));
vi.mock('../lib/invoke', () => ({ invokeRecordBookmarkAccess: recordAccessMock }));
vi.mock('@/components/ui/toast', () => ({
  toast: { add: toastAddMock },
}));

vi.mock('./SearchBar', async () => {
  const React = await import('react');
  return {
    default: React.forwardRef<HTMLInputElement, { onSearch: (value: string) => void }>(
      function SearchBarMock({ onSearch }, ref) {
        return (
          <div>
            <input ref={ref} aria-label="搜索书签" defaultValue="current query" />
            <button data-testid="search-bar" onClick={() => onSearch('needle')}>
              搜索
            </button>
            <button onClick={() => onSearch('')}>清空搜索</button>
          </div>
        );
      },
    ),
  };
});
vi.mock('./BookmarkSidebar', () => ({
  default: ({
    onTagsChange,
    onBaseViewChange,
  }: {
    onTagsChange: (tags: string[]) => void;
    onBaseViewChange: (view: 'all' | 'starred') => void;
  }) => (
    <div>
      <button data-testid="tag-panel" onClick={() => onTagsChange(['tool'])}>
        标签
      </button>
      <button onClick={() => onTagsChange([])}>清空标签</button>
      <button onClick={() => onBaseViewChange('all')}>全部视图</button>
      <button onClick={() => onBaseViewChange('starred')}>星标视图</button>
    </div>
  ),
}));
vi.mock('./AddBookmarkDialog', () => ({
  default: () => null,
}));
vi.mock('./ResultList', () => ({
  default: (props: {
    bookmarks: Bookmark[];
    hasMore: boolean;
    nextPageError: string | null;
    onLoadMore: () => void;
    starredView: boolean;
    emptyMessage: string;
    starPendingId: number | null;
    onToggleStarred: (bookmark: Bookmark, starred: boolean) => void;
    onPreviewBookmark: (bookmark: Bookmark, trigger: HTMLElement) => void;
    onOpenBookmark: (bookmark: Bookmark) => void;
    activeBookmarkId: number | null;
    onActiveBookmarkChange: (id: number) => void;
    onBookmarkElementChange: (id: number, element: HTMLElement | null) => void;
  }) => (
    <div>
      <div>{props.starredView ? '星标模式' : '普通模式'}</div>
      {props.bookmarks.length === 0 && <div>{props.emptyMessage}</div>}
      {props.bookmarks.map((bookmark) => (
        <div
          key={bookmark.id}
          ref={(element) => props.onBookmarkElementChange(bookmark.id, element)}
          aria-current={props.activeBookmarkId === bookmark.id ? 'true' : undefined}
          onClick={() => props.onActiveBookmarkChange(bookmark.id)}
        >
          {bookmark.title}
        </div>
      ))}
      {props.bookmarks[0] && (
        <>
          <button onClick={() => props.onToggleStarred(props.bookmarks[0], true)}>切换星标</button>
          <button
            onClick={(event) => props.onPreviewBookmark(props.bookmarks[0], event.currentTarget)}
          >
            预览书签
          </button>
          <button onClick={() => props.onOpenBookmark(props.bookmarks[0])}>打开书签</button>
        </>
      )}
      {props.starPendingId !== null && <div>正在更新 {props.starPendingId}</div>}
      {props.hasMore && <button onClick={props.onLoadMore}>加载更多</button>}
      {props.nextPageError && <div>{props.nextPageError}</div>}
    </div>
  ),
}));
vi.mock('./BookmarkWebPreview', () => ({
  default: ({
    bookmark,
    open,
    onOpenChange,
  }: {
    bookmark: Bookmark | null;
    open: boolean;
    onOpenChange: (open: boolean) => void;
  }) =>
    open && bookmark ? (
      <div data-testid="web-preview">
        {bookmark.url}
        <button onClick={() => onOpenChange(false)}>关闭预览</button>
      </div>
    ) : null,
}));

function bookmark(id: number, title: string): Bookmark {
  return {
    id,
    url: `https://example.com/${id}`,
    title,
    description: '',
    tags: [],
    access_count: 0,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    accessed_at: null,
    starred_at: null,
  };
}

function renderView() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <BookmarkView />
    </QueryClientProvider>,
  );
}

function lastBookmarkRequest() {
  const calls = queryBookmarksMock.mock.calls;
  return calls[calls.length - 1]?.[0];
}

function dispatchKey(key: string, modifiers: KeyboardEventInit = {}) {
  const event = new KeyboardEvent('keydown', { key, cancelable: true, ...modifiers });
  act(() => document.dispatchEvent(event));
  return event;
}

describe('BookmarkView infinite pagination', () => {
  beforeEach(() => {
    queryBookmarksMock.mockReset();
    setBookmarkStarredMock.mockReset();
    openMock.mockReset();
    recordAccessMock.mockReset();
    recordAccessMock.mockResolvedValue(undefined);
    toastAddMock.mockReset();
  });

  afterEach(cleanup);

  it('flattens pages and loads the next cursor once', async () => {
    queryBookmarksMock.mockImplementation(
      ({ cursor }: { cursor: string | null }): Promise<BookmarkPage> =>
        Promise.resolve(
          cursor === null
            ? { items: [bookmark(1, 'First')], next_cursor: 'next' }
            : { items: [bookmark(2, 'Second')], next_cursor: null },
        ),
    );
    renderView();

    expect(await screen.findByText('First')).toBeTruthy();
    fireEvent.click(screen.getByText('加载更多'));
    expect(await screen.findByText('Second')).toBeTruthy();
    expect(screen.getByText('First')).toBeTruthy();
    expect(queryBookmarksMock).toHaveBeenCalledTimes(2);
  });

  it('keeps existing rows when the next page fails', async () => {
    queryBookmarksMock
      .mockResolvedValueOnce({
        items: [bookmark(1, 'Still visible')],
        next_cursor: 'next',
      })
      .mockRejectedValueOnce(new Error('下一页失败'));
    renderView();

    expect(await screen.findByText('Still visible')).toBeTruthy();
    fireEvent.click(screen.getByText('加载更多'));
    await waitFor(() => expect(screen.getByText('下一页失败')).toBeTruthy());
    expect(screen.getByText('Still visible')).toBeTruthy();
  });

  it('defaults to all bookmarks and switches to the dedicated starred view', async () => {
    queryBookmarksMock.mockResolvedValue({ items: [], next_cursor: null });
    renderView();

    expect(await screen.findByText('普通模式')).toBeTruthy();
    expect(screen.getByText('暂无书签')).toBeTruthy();
    expect(queryBookmarksMock.mock.calls[0]?.[0].starred_only).toBe(false);

    fireEvent.click(screen.getByText('星标视图'));
    expect(await screen.findByText('星标模式')).toBeTruthy();
    expect(
      screen.getByText('暂无星标书签。在搜索结果中点击星形按钮，即可将常用书签显示在这里。'),
    ).toBeTruthy();
    expect(lastBookmarkRequest().starred_only).toBe(true);
  });

  it('temporarily ignores the base view while searching and restores it afterward', async () => {
    queryBookmarksMock.mockResolvedValue({ items: [], next_cursor: null });
    renderView();

    await screen.findByText('暂无书签');
    fireEvent.click(screen.getByText('星标视图'));
    expect(await screen.findByText('星标模式')).toBeTruthy();

    fireEvent.click(screen.getByTestId('search-bar'));
    expect(await screen.findByText('普通模式')).toBeTruthy();
    expect(screen.getByText('暂无匹配的书签')).toBeTruthy();
    expect(lastBookmarkRequest()).toMatchObject({
      query: 'needle',
      starred_only: false,
    });

    fireEvent.click(screen.getByText('清空搜索'));
    expect(await screen.findByText('星标模式')).toBeTruthy();
    expect(lastBookmarkRequest().starred_only).toBe(true);
  });

  it('keeps tag filtering in normal mode regardless of the base view', async () => {
    queryBookmarksMock.mockResolvedValue({ items: [], next_cursor: null });
    renderView();

    await screen.findByText('暂无书签');
    fireEvent.click(screen.getByText('星标视图'));
    expect(await screen.findByText('星标模式')).toBeTruthy();
    fireEvent.click(screen.getByTestId('tag-panel'));

    expect(await screen.findByText('普通模式')).toBeTruthy();
    expect(lastBookmarkRequest()).toMatchObject({
      tags: ['tool'],
      starred_only: false,
    });

    fireEvent.click(screen.getByText('清空标签'));
    expect(await screen.findByText('星标模式')).toBeTruthy();
  });

  it('calls the star API, exposes pending state, and refreshes bookmarks on success', async () => {
    queryBookmarksMock.mockResolvedValue({
      items: [bookmark(1, 'Star me')],
      next_cursor: null,
    });
    let resolveStar!: (value: Bookmark) => void;
    setBookmarkStarredMock.mockImplementation(
      () => new Promise<Bookmark>((resolve) => (resolveStar = resolve)),
    );
    renderView();

    expect(await screen.findByText('Star me')).toBeTruthy();
    fireEvent.click(screen.getByText('切换星标'));
    await waitFor(() =>
      expect(setBookmarkStarredMock.mock.calls[0]?.[0]).toEqual({ id: 1, starred: true }),
    );
    expect(await screen.findByText('正在更新 1')).toBeTruthy();

    resolveStar({ ...bookmark(1, 'Star me'), starred_at: '2026-01-02T00:00:00Z' });
    await waitFor(() => expect(queryBookmarksMock.mock.calls.length).toBeGreaterThan(1));
  });

  it('shows a visible error when updating a star fails', async () => {
    queryBookmarksMock.mockResolvedValue({
      items: [bookmark(1, 'Star me')],
      next_cursor: null,
    });
    setBookmarkStarredMock.mockRejectedValue(new Error('写入失败'));
    renderView();

    expect(await screen.findByText('Star me')).toBeTruthy();
    fireEvent.click(screen.getByText('切换星标'));

    expect((await screen.findByRole('alert')).textContent).toContain('写入失败');
  });

  it('opens an HTTP bookmark preview and records one access', async () => {
    queryBookmarksMock.mockResolvedValue({
      items: [bookmark(1, 'Preview me')],
      next_cursor: null,
    });
    renderView();

    fireEvent.click(await screen.findByText('预览书签'));

    expect(screen.getByTestId('web-preview').textContent).toContain('https://example.com/1');
    expect(recordAccessMock).toHaveBeenCalledOnce();
    expect(recordAccessMock).toHaveBeenCalledWith(1);
    expect(openMock).not.toHaveBeenCalled();
  });

  it('routes non-HTTP protocols externally without opening the preview', async () => {
    const customBookmark = { ...bookmark(1, 'Custom'), url: 'obsidian://open?vault=notes' };
    queryBookmarksMock.mockResolvedValue({ items: [customBookmark], next_cursor: null });
    openMock.mockResolvedValue(undefined);
    renderView();

    fireEvent.click(await screen.findByText('预览书签'));

    await waitFor(() => expect(openMock).toHaveBeenCalledWith(customBookmark.url));
    expect(screen.queryByTestId('web-preview')).toBeNull();
    expect(recordAccessMock).toHaveBeenCalledWith(customBookmark.id);
  });

  it('fails a non-HTTP protocol safely without recording access', async () => {
    const customBookmark = { ...bookmark(1, 'Custom'), url: 'unknown://resource' };
    queryBookmarksMock.mockResolvedValue({ items: [customBookmark], next_cursor: null });
    openMock.mockRejectedValue(new Error('no handler'));
    renderView();

    fireEvent.click(await screen.findByText('预览书签'));

    await waitFor(() => expect(toastAddMock).toHaveBeenCalled());
    expect(screen.queryByTestId('web-preview')).toBeNull();
    expect(recordAccessMock).not.toHaveBeenCalled();
  });

  it('restores focus to the preview trigger after closing', async () => {
    queryBookmarksMock.mockResolvedValue({
      items: [bookmark(1, 'Preview me')],
      next_cursor: null,
    });
    renderView();

    const trigger = await screen.findByText('预览书签');
    fireEvent.click(trigger);
    fireEvent.click(screen.getByText('关闭预览'));

    expect(document.activeElement).toBe(trigger);
  });

  it('focuses and selects the bookmark search input with slash', async () => {
    queryBookmarksMock.mockResolvedValue({ items: [], next_cursor: null });
    renderView();
    await screen.findByText('暂无书签');

    const input = screen.getByRole('textbox', { name: '搜索书签' }) as HTMLInputElement;
    input.blur();
    const shortcut = dispatchKey('/');

    expect(shortcut.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(input);
    expect(input.selectionStart).toBe(0);
    expect(input.selectionEnd).toBe(input.value.length);
  });

  it('moves the active bookmark with j and k without wrapping', async () => {
    queryBookmarksMock.mockResolvedValue({
      items: [bookmark(1, 'First'), bookmark(2, 'Second')],
      next_cursor: null,
    });
    renderView();
    await screen.findByText('First');
    await waitFor(() =>
      expect(screen.getByText('First').getAttribute('aria-current')).toBe('true'),
    );

    const scrollIntoView = vi.fn();
    Object.defineProperty(screen.getByText('Second'), 'scrollIntoView', {
      configurable: true,
      value: scrollIntoView,
    });
    dispatchKey('j');
    expect(screen.getByText('Second').getAttribute('aria-current')).toBe('true');
    expect(scrollIntoView).toHaveBeenCalledWith({ block: 'nearest' });
    dispatchKey('j');
    expect(screen.getByText('Second').getAttribute('aria-current')).toBe('true');
    dispatchKey('k');
    expect(screen.getByText('First').getAttribute('aria-current')).toBe('true');
    dispatchKey('k');
    expect(screen.getByText('First').getAttribute('aria-current')).toBe('true');
  });

  it('keeps an available active bookmark and falls back when filtering removes it', async () => {
    queryBookmarksMock.mockImplementation(({ query }: { query: string }): Promise<BookmarkPage> =>
      Promise.resolve(
        query
          ? { items: [bookmark(2, 'Second'), bookmark(3, 'Third')], next_cursor: null }
          : { items: [bookmark(1, 'First'), bookmark(2, 'Second')], next_cursor: null },
      ),
    );
    renderView();
    await screen.findByText('First');
    await waitFor(() =>
      expect(screen.getByText('First').getAttribute('aria-current')).toBe('true'),
    );

    dispatchKey('j');
    expect(screen.getByText('Second').getAttribute('aria-current')).toBe('true');
    fireEvent.click(screen.getByTestId('search-bar'));
    await screen.findByText('Third');
    await waitFor(() =>
      expect(screen.getByText('Second').getAttribute('aria-current')).toBe('true'),
    );

    dispatchKey('j');
    expect(screen.getByText('Third').getAttribute('aria-current')).toBe('true');
    fireEvent.click(screen.getByText('清空搜索'));
    await screen.findByText('First');
    await waitFor(() =>
      expect(screen.getByText('First').getAttribute('aria-current')).toBe('true'),
    );
  });

  it('previews, closes, and opens the active bookmark from single-key shortcuts', async () => {
    queryBookmarksMock.mockResolvedValue({
      items: [bookmark(1, 'First'), bookmark(2, 'Second')],
      next_cursor: null,
    });
    openMock.mockResolvedValue(undefined);
    renderView();
    await screen.findByText('First');
    await waitFor(() =>
      expect(screen.getByText('First').getAttribute('aria-current')).toBe('true'),
    );

    dispatchKey('j');
    dispatchKey('p');
    expect(screen.getByTestId('web-preview').textContent).toContain('https://example.com/2');
    expect(recordAccessMock).toHaveBeenCalledWith(2);

    dispatchKey('x');
    expect(screen.queryByTestId('web-preview')).toBeNull();

    dispatchKey('o');
    await waitFor(() => expect(openMock).toHaveBeenCalledWith('https://example.com/2'));
    expect(recordAccessMock).toHaveBeenCalledTimes(2);
  });

  it('ignores bookmark single-key shortcuts while a text input is focused', async () => {
    queryBookmarksMock.mockResolvedValue({
      items: [bookmark(1, 'First'), bookmark(2, 'Second')],
      next_cursor: null,
    });
    renderView();
    await screen.findByText('First');
    await waitFor(() =>
      expect(screen.getByText('First').getAttribute('aria-current')).toBe('true'),
    );

    const input = screen.getByRole('textbox', { name: '搜索书签' });
    input.focus();
    const shortcut = dispatchKey('j');

    expect(shortcut.defaultPrevented).toBe(false);
    expect(screen.getByText('First').getAttribute('aria-current')).toBe('true');
    expect(screen.getByText('Second').getAttribute('aria-current')).toBeNull();
  });
});
