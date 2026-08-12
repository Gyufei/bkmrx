// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import type { Bookmark } from '@/types';
import BookmarkWebPreview from './BookmarkWebPreview';

const openMock = vi.hoisted(() => vi.fn());

vi.mock('@tauri-apps/plugin-shell', () => ({ open: openMock }));

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

beforeEach(() => openMock.mockReset());
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

it('renders bookmark identity and a sandboxed iframe', () => {
  renderPreview();

  expect(screen.getByRole('heading', { name: bookmark.title })).toBeTruthy();
  expect(screen.getByText('example.com')).toBeTruthy();
  const frame = screen.getByTitle(`预览：${bookmark.title}`);
  expect(frame.getAttribute('src')).toBe(bookmark.url);
  expect(frame.getAttribute('sandbox')).toBe('allow-scripts allow-forms allow-same-origin');
});

it('shows loading until the iframe loads and restores it on refresh', () => {
  renderPreview();

  expect(screen.getByRole('status').textContent).toContain('正在加载网页');
  const firstFrame = screen.getByTitle(`预览：${bookmark.title}`);
  fireEvent.load(firstFrame);
  expect(screen.queryByRole('status')).toBeNull();

  fireEvent.click(screen.getByRole('button', { name: '刷新网页' }));
  expect(screen.getByRole('status')).toBeTruthy();
  expect(screen.getByTitle(`预览：${bookmark.title}`)).not.toBe(firstFrame);
});

it('opens the original bookmark externally without closing', () => {
  const { onOpenChange } = renderPreview();

  fireEvent.click(screen.getByRole('button', { name: '在浏览器中打开' }));
  expect(openMock).toHaveBeenCalledWith(bookmark.url);
  expect(onOpenChange).not.toHaveBeenCalled();
});

it('closes with the explicit close button', () => {
  const { onOpenChange } = renderPreview();

  fireEvent.click(screen.getByRole('button', { name: '关闭预览' }));
  expect(onOpenChange).toHaveBeenCalledWith(false);
});

it('closes with Escape but not by pressing the overlay', () => {
  const { onOpenChange, container } = renderPreview();

  fireEvent.pointerDown(container.querySelector('[data-slot="sheet-overlay"]')!);
  fireEvent.click(container.querySelector('[data-slot="sheet-overlay"]')!);
  expect(onOpenChange).not.toHaveBeenCalled();

  fireEvent.keyDown(document, { key: 'Escape' });
  expect(onOpenChange).toHaveBeenCalledWith(false);
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
