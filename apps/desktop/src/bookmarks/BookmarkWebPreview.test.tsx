// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import type { Bookmark, BookmarkPreview } from '@/types';
import BookmarkWebPreview from './BookmarkWebPreview';

const mocks = vi.hoisted(() => ({
  open: vi.fn(),
  prepare: vi.fn(),
}));

vi.mock('@tauri-apps/plugin-shell', () => ({ open: mocks.open }));
vi.mock('@/lib/invoke', () => ({ invokePrepareBookmarkPreview: mocks.prepare }));

const bookmark: Bookmark = {
  id: 1,
  url: 'https://example.com/article',
  title: 'Example article',
  description: '',
  tags: [],
  access_count: 0,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  accessed_at: null,
  starred_at: null,
};

const webPreview: BookmarkPreview = {
  kind: 'web',
  url: bookmark.url,
  final_url: bookmark.url,
};

beforeEach(() => {
  mocks.open.mockReset();
  mocks.prepare.mockReset();
  mocks.prepare.mockResolvedValue(webPreview);
});
afterEach(cleanup);

function renderPreview(onOpenChange = vi.fn()) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const result = render(
    <BookmarkWebPreview
      bookmark={bookmark}
      open
      onOpenChange={onOpenChange}
      container={container}
    />,
  );
  return { ...result, onOpenChange, container };
}

it('prepares the preview then renders a sandboxed iframe', async () => {
  renderPreview();

  expect(screen.getByRole('status').textContent).toContain('正在准备预览');
  const frame = await screen.findByTitle(`预览：${bookmark.title}`);
  expect(mocks.prepare).toHaveBeenCalledWith(
    { bookmark_id: bookmark.id, url: bookmark.url },
    false,
  );
  expect(frame.getAttribute('src')).toBe(bookmark.url);
  expect(frame.getAttribute('sandbox')).toBe('allow-scripts allow-forms allow-same-origin');
});

it('renders GitHub repository information without an iframe', async () => {
  mocks.prepare.mockResolvedValue({
    kind: 'github_repository',
    url: 'https://github.com/openai/openai-python',
    repository: {
      owner: 'openai',
      name: 'openai-python',
      full_name: 'openai/openai-python',
      description: 'Official Python library',
      html_url: 'https://github.com/openai/openai-python',
      owner_avatar_url: null,
      primary_language: 'Python',
      stars: 100,
      forks: 20,
      topics: [],
      default_branch: 'main',
      updated_at: '2026-08-14T00:00:00Z',
    },
  });

  renderPreview();

  expect(await screen.findByText('openai/openai-python')).toBeTruthy();
  expect(screen.getByText('Official Python library')).toBeTruthy();
  expect(screen.queryByTitle(`预览：${bookmark.title}`)).toBeNull();
});

it('renders a persistent fallback card and retries transient failures', async () => {
  mocks.prepare.mockResolvedValue({
    kind: 'fallback',
    url: bookmark.url,
    reason: 'timeout',
    message: '网页响应超时，请稍后重试',
    http_status: null,
  });
  renderPreview();

  expect((await screen.findByRole('alert')).textContent).toContain('网页加载超时');
  fireEvent.click(screen.getByRole('button', { name: '重试' }));
  await waitFor(() =>
    expect(mocks.prepare).toHaveBeenLastCalledWith(
      { bookmark_id: bookmark.id, url: bookmark.url },
      true,
    ),
  );
});

it('does not offer retry when embedding is explicitly denied', async () => {
  mocks.prepare.mockResolvedValue({
    kind: 'fallback',
    url: bookmark.url,
    reason: 'embedding_denied',
    message: '该网站的安全策略不允许在应用内显示',
    http_status: null,
  });
  renderPreview();

  expect((await screen.findByRole('alert')).textContent).toContain('此网站不允许应用内预览');
  expect(screen.queryByRole('button', { name: '重试' })).toBeNull();
});

it('uses the fallback card when preview preparation fails unexpectedly', async () => {
  mocks.prepare.mockRejectedValue(new Error('invoke failed'));
  renderPreview();

  expect((await screen.findByRole('alert')).textContent).toContain('预览准备失败');
  expect(screen.getByRole('button', { name: '重试' })).toBeTruthy();
});

it('falls back when an iframe does not finish rendering in time', async () => {
  const nativeSetTimeout = globalThis.setTimeout;
  const timeoutSpy = vi
    .spyOn(globalThis, 'setTimeout')
    .mockImplementation((handler, delay, ...args) => {
      if (delay === 10_000) {
        queueMicrotask(() => {
          if (typeof handler === 'function') handler();
        });
        return 999 as unknown as ReturnType<typeof setTimeout>;
      }
      return nativeSetTimeout(handler, delay, ...args);
    });
  renderPreview();

  expect((await screen.findByRole('alert')).textContent).toContain('网页加载超时');
  expect(screen.queryByTitle(`预览：${bookmark.title}`)).toBeNull();
  timeoutSpy.mockRestore();
});

it('restores iframe loading on toolbar refresh and bypasses cache', async () => {
  renderPreview();
  const firstFrame = await screen.findByTitle(`预览：${bookmark.title}`);
  fireEvent.load(firstFrame);
  expect(screen.queryByRole('status')).toBeNull();

  fireEvent.click(screen.getByRole('button', { name: '刷新网页' }));
  expect(screen.getByRole('status').textContent).toContain('正在准备预览');
  await waitFor(() =>
    expect(mocks.prepare).toHaveBeenLastCalledWith(
      { bookmark_id: bookmark.id, url: bookmark.url },
      true,
    ),
  );
});

it('opens externally without closing', async () => {
  const { onOpenChange } = renderPreview();
  await screen.findByTitle(`预览：${bookmark.title}`);

  fireEvent.click(screen.getByRole('button', { name: '在浏览器中打开' }));
  expect(mocks.open).toHaveBeenCalledWith(bookmark.url);
  expect(onOpenChange).not.toHaveBeenCalled();
});

it('closes explicitly and with Escape but not by pressing the overlay', async () => {
  const { onOpenChange, container } = renderPreview();
  await screen.findByTitle(`预览：${bookmark.title}`);

  fireEvent.pointerDown(container.querySelector('[data-slot="sheet-overlay"]')!);
  fireEvent.click(container.querySelector('[data-slot="sheet-overlay"]')!);
  expect(onOpenChange).not.toHaveBeenCalled();

  fireEvent.keyDown(document, { key: 'Escape' });
  expect(onOpenChange).toHaveBeenCalledWith(false);
});

it('ignores a stale preview response after the bookmark changes', async () => {
  let resolveFirst: (preview: BookmarkPreview) => void = () => undefined;
  mocks.prepare
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveFirst = resolve;
        }),
    )
    .mockResolvedValueOnce(webPreview);
  const { rerender, container } = renderPreview();
  const second = { ...bookmark, id: 2, title: 'Second article' };

  rerender(
    <BookmarkWebPreview bookmark={second} open onOpenChange={vi.fn()} container={container} />,
  );
  await screen.findByTitle('预览：Second article');
  resolveFirst({
    kind: 'fallback',
    url: bookmark.url,
    reason: 'timeout',
    message: 'stale error',
    http_status: null,
  });

  await Promise.resolve();
  expect(screen.queryByText('stale error')).toBeNull();
});

it('does not apply global scroll-lock layout styles', async () => {
  renderPreview();
  await new Promise((resolve) => setTimeout(resolve, 10));
  expect(document.body.style.position).toBe('');
  expect(document.body.style.width).toBe('');
  expect(document.body.style.height).toBe('');
  expect(document.documentElement.hasAttribute('data-base-ui-scroll-locked')).toBe(false);
});

it('does not focus an offscreen toolbar button during the opening animation', async () => {
  renderPreview();
  const closeButton = screen.getByRole('button', { name: '关闭预览' });
  const focusSpy = vi.spyOn(closeButton, 'focus');

  await new Promise((resolve) => requestAnimationFrame(resolve));

  expect(focusSpy).not.toHaveBeenCalled();
});
