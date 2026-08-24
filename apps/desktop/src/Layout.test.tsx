// @vitest-environment jsdom

import { act, cleanup, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import AppHome from './Layout';

vi.mock('./Navbar', async (importOriginal) => {
  const original = await importOriginal<typeof import('./Navbar')>();
  return {
    ...original,
    default: () => <input aria-label="导航测试输入框" />,
  };
});
vi.mock('./bookmarks/BookmarkView', () => ({
  default: () => <input aria-label="书签临时状态" defaultValue="书签工作区" />,
}));
vi.mock('./notes/NotesPanel', () => ({
  default: () => <input aria-label="笔记临时状态" defaultValue="笔记工作区" />,
}));
vi.mock('./todos/TodoPage', () => ({ default: () => <div>Todo 工作区</div> }));
vi.mock('./rss/RssPage', () => ({ default: () => <div>RSS 工作区</div> }));
vi.mock('./settings/SettingsPage', () => ({ default: () => <div>设置工作区</div> }));

function dispatchModKey(key: string) {
  const event = new KeyboardEvent('keydown', { key, ctrlKey: true, cancelable: true });
  act(() => document.dispatchEvent(event));
  return event;
}

describe('AppHome workspace hotkeys', () => {
  beforeEach(() => {
    vi.spyOn(window.navigator, 'platform', 'get').mockReturnValue('Linux x86_64');
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('switches between bookmark, note, and Todo workspaces with Mod+1/2/3', () => {
    render(<AppHome />);
    expect(screen.getByRole('textbox', { name: '书签临时状态' })).toBeVisible();

    expect(dispatchModKey('2').defaultPrevented).toBe(true);
    expect(screen.getByRole('textbox', { name: '笔记临时状态' })).toBeVisible();

    expect(dispatchModKey('3').defaultPrevented).toBe(true);
    expect(screen.getByText('Todo 工作区')).toBeTruthy();

    expect(dispatchModKey('1').defaultPrevented).toBe(true);
    expect(screen.getByRole('textbox', { name: '书签临时状态' })).toBeVisible();
  });

  it('keeps workspace hotkeys active while an input is focused', () => {
    render(<AppHome />);
    screen.getByRole('textbox', { name: '导航测试输入框' }).focus();

    dispatchModKey('2');

    expect(screen.getByRole('textbox', { name: '笔记临时状态' })).toBeVisible();
  });

  it('preserves each workspace DOM state while switching tabs', () => {
    render(<AppHome />);
    const bookmarkInput = screen.getByRole('textbox', { name: '书签临时状态' });
    act(() => {
      bookmarkInput.setAttribute('data-temporary-state', 'preserved');
    });

    dispatchModKey('2');
    expect(bookmarkInput).not.toBeVisible();
    expect(screen.getByRole('textbox', { name: '笔记临时状态' })).toBeVisible();

    dispatchModKey('1');
    expect(bookmarkInput).toBeVisible();
    expect(bookmarkInput).toHaveAttribute('data-temporary-state', 'preserved');
  });

  it('removes workspace hotkeys on unmount', () => {
    const view = render(<AppHome />);
    view.unmount();

    expect(dispatchModKey('2').defaultPrevented).toBe(false);
  });
});
