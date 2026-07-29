// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const session = vi.hoisted(() => ({
  content: '# Read me',
  loadState: 'ready' as 'loading' | 'ready' | 'error',
  loadError: null as Error | null,
  saveState: 'idle' as 'idle' | 'saving' | 'saved' | 'error',
  saveError: null as {
    path: string;
    content: string;
    error: Error;
  } | null,
  dirty: false as boolean,
  setContent: vi.fn(),
  retryRead: vi.fn(),
  flush: vi.fn().mockResolvedValue(undefined),
  retrySave: vi.fn().mockResolvedValue(undefined),
  dismissSaveError: vi.fn(),
}));

const editorHarness = vi.hoisted(() => ({
  autoReady: true,
  mounts: 0,
  initialSnapshots: [] as Array<{
    anchor: number;
    head: number;
    scrollTop: number;
  } | null>,
  nextSnapshot: { anchor: 3, head: 7, scrollTop: 96 },
}));

vi.mock('./use-note-document', () => ({
  useNoteDocument: vi.fn(() => session),
}));

vi.mock('./MarkdownSourceEditor', async () => {
  const { useEffect, useRef } = await import('react');

  return {
    default: ({
      value,
      initialSnapshot,
      onChange,
      onSnapshot,
      onReady,
    }: {
      value: string;
      initialSnapshot: { anchor: number; head: number; scrollTop: number } | null;
      onChange(value: string): void;
      onSnapshot(snapshot: { anchor: number; head: number; scrollTop: number }): void;
      onReady?(): void;
    }) => {
      const onSnapshotRef = useRef(onSnapshot);
      onSnapshotRef.current = onSnapshot;

      useEffect(() => {
        editorHarness.mounts += 1;
        editorHarness.initialSnapshots.push(initialSnapshot);
        if (editorHarness.autoReady) onReady?.();
        return () => onSnapshotRef.current(editorHarness.nextSnapshot);
      }, []);

      return (
        <textarea
          aria-label="Markdown source"
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
      );
    },
  };
});

import NoteEditor from './NoteEditor';

function renderEditor(filePath = '/notes/a.md') {
  const queryClient = new QueryClient({
    defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
  });
  const result = render(
    <QueryClientProvider client={queryClient}>
      <NoteEditor filePath={filePath} />
    </QueryClientProvider>,
  );
  return {
    ...result,
    rerenderEditor(nextFilePath: string) {
      result.rerender(
        <QueryClientProvider client={queryClient}>
          <NoteEditor filePath={nextFilePath} />
        </QueryClientProvider>,
      );
    },
  };
}

function dispatchShortcut(
  key: string,
  modifiers: { metaKey?: boolean; ctrlKey?: boolean } = { metaKey: true },
) {
  const event = new KeyboardEvent('keydown', {
    key,
    ...modifiers,
    cancelable: true,
  });
  act(() => document.dispatchEvent(event));
  return event;
}

afterEach(cleanup);

describe('NoteEditor', () => {
  beforeEach(() => {
    session.content = '# Read me';
    session.loadState = 'ready';
    session.loadError = null;
    session.saveState = 'idle';
    session.saveError = null;
    session.dirty = false;
    session.setContent.mockReset();
    session.retryRead.mockReset().mockResolvedValue(undefined);
    session.flush.mockReset().mockResolvedValue(undefined);
    session.retrySave.mockReset().mockResolvedValue(undefined);
    session.dismissSaveError.mockReset();
    editorHarness.autoReady = true;
    editorHarness.mounts = 0;
    editorHarness.initialSnapshots.length = 0;
    editorHarness.nextSnapshot = { anchor: 3, head: 7, scrollTop: 96 };
  });

  it('opens in rendered view and exposes a low-emphasis edit button', async () => {
    renderEditor();

    expect(await screen.findByRole('heading', { name: 'Read me' })).toBeTruthy();
    expect(screen.getByRole('button', { name: /编辑/ })).toBeTruthy();
    expect(screen.queryByRole('textbox', { name: 'Markdown source' })).toBeNull();
    expect(editorHarness.mounts).toBe(0);
  });

  it('disables the mode toggle until the source editor signals readiness', async () => {
    editorHarness.autoReady = false;
    renderEditor();
    fireEvent.click(screen.getByRole('button', { name: /编辑/ }));

    expect(screen.getByText('加载编辑器...')).toBeTruthy();
    expect(screen.getByRole('button', { name: /查看/ }).hasAttribute('disabled')).toBe(true);
    expect(await screen.findByRole('textbox', { name: 'Markdown source' })).toBeTruthy();
    expect(screen.getByRole('button', { name: /查看/ }).hasAttribute('disabled')).toBe(true);

    const unavailableToggle = dispatchShortcut('e');
    expect(unavailableToggle.defaultPrevented).toBe(false);
    expect(screen.getByRole('textbox', { name: 'Markdown source' })).toBeTruthy();
  });

  it('enters source edit mode from the button', async () => {
    renderEditor();
    fireEvent.click(screen.getByRole('button', { name: /编辑/ }));

    expect(await screen.findByRole('textbox', { name: 'Markdown source' })).toBeTruthy();
    expect(screen.getByRole('button', { name: /查看/ })).toBeTruthy();
  });

  it('toggles with Cmd/Ctrl+E and prevents the applicable default action', async () => {
    renderEditor();
    const enter = dispatchShortcut('E');

    expect(enter.defaultPrevented).toBe(true);
    expect(await screen.findByRole('textbox', { name: 'Markdown source' })).toBeTruthy();
  });

  it('waits for a dirty flush before returning to view mode', async () => {
    let resolveSave!: () => void;
    session.dirty = true;
    session.flush.mockReturnValueOnce(
      new Promise<void>((resolve) => {
        resolveSave = resolve;
      }),
    );
    renderEditor();
    fireEvent.click(screen.getByRole('button', { name: /编辑/ }));
    fireEvent.click(await screen.findByRole('button', { name: /查看/ }));

    expect(screen.getByRole('textbox', { name: 'Markdown source' })).toBeTruthy();
    act(() => resolveSave());
    await waitFor(() =>
      expect(screen.queryByRole('textbox', { name: 'Markdown source' })).toBeNull(),
    );
  });

  it('keeps the editor open when the exit flush fails', async () => {
    session.dirty = true;
    session.flush.mockRejectedValueOnce(new Error('disk full'));
    const editor = renderEditor();
    fireEvent.click(screen.getByRole('button', { name: /编辑/ }));
    fireEvent.click(await screen.findByRole('button', { name: /查看/ }));

    expect(await screen.findByRole('textbox', { name: 'Markdown source' })).toBeTruthy();
    await waitFor(() => expect(session.flush).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /查看/ }).hasAttribute('disabled')).toBe(false),
    );

    session.saveError = {
      path: '/notes/a.md',
      content: '# Read me',
      error: new Error('disk full'),
    };
    editor.rerenderEditor('/notes/a.md');
    fireEvent.click(screen.getByRole('button', { name: '重试' }));
    expect(session.retrySave).toHaveBeenCalledTimes(1);

    session.dirty = false;
    session.saveError = null;
    editor.rerenderEditor('/notes/a.md');
    fireEvent.click(screen.getByRole('button', { name: /查看/ }));
    await screen.findByRole('heading', { name: 'Read me' });
    expect(session.flush).toHaveBeenCalledTimes(1);
  });

  it('handles Cmd/Ctrl+S only in edit mode', async () => {
    renderEditor();
    const viewSave = dispatchShortcut('s');

    expect(viewSave.defaultPrevented).toBe(false);
    expect(session.flush).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: /编辑/ }));
    await screen.findByRole('textbox', { name: 'Markdown source' });
    const editSave = dispatchShortcut('S', { ctrlKey: true });

    expect(editSave.defaultPrevented).toBe(true);
    expect(session.flush).toHaveBeenCalledTimes(1);
  });

  it('coalesces repeated mode shortcuts while an exit flush is pending', async () => {
    let resolveSave!: () => void;
    session.dirty = true;
    session.flush.mockReturnValueOnce(
      new Promise<void>((resolve) => {
        resolveSave = resolve;
      }),
    );
    renderEditor();
    dispatchShortcut('e');
    await screen.findByRole('textbox', { name: 'Markdown source' });

    dispatchShortcut('e');
    dispatchShortcut('e');
    expect(session.flush).toHaveBeenCalledTimes(1);

    act(() => resolveSave());
    await screen.findByRole('heading', { name: 'Read me' });
  });

  it('resets to rendered view when the selected file changes', async () => {
    const editor = renderEditor();
    fireEvent.click(screen.getByRole('button', { name: /编辑/ }));
    await screen.findByRole('textbox', { name: 'Markdown source' });

    editor.rerenderEditor('/notes/b.md');

    expect(await screen.findByRole('heading', { name: 'Read me' })).toBeTruthy();
    expect(screen.getByText('b.md')).toBeTruthy();
    expect(screen.queryByRole('textbox', { name: 'Markdown source' })).toBeNull();
  });

  it('removes its document shortcuts on unmount', () => {
    const editor = renderEditor();
    editor.unmount();

    const shortcut = dispatchShortcut('e');

    expect(shortcut.defaultPrevented).toBe(false);
  });

  it('renders the failed file name and background-save recovery actions', () => {
    session.saveError = {
      path: '/notes/failed.md',
      content: '# Unsaved',
      error: new Error('disk full'),
    };
    renderEditor();

    expect(screen.getByRole('alert').textContent).toContain('failed.md');
    fireEvent.click(screen.getByRole('button', { name: '重试' }));
    fireEvent.click(screen.getByRole('button', { name: '忽略' }));

    expect(session.retrySave).toHaveBeenCalledTimes(1);
    expect(session.dismissSaveError).toHaveBeenCalledTimes(1);
  });

  it('restores rendered-view scroll after an edit round trip', async () => {
    renderEditor();
    const scroller = screen.getByTestId('markdown-view-scroll');
    Object.defineProperty(scroller, 'scrollTop', {
      configurable: true,
      value: 140,
      writable: true,
    });
    fireEvent.scroll(scroller);

    fireEvent.click(screen.getByRole('button', { name: /编辑/ }));
    await screen.findByRole('textbox', { name: 'Markdown source' });
    fireEvent.click(screen.getByRole('button', { name: /查看/ }));

    expect(await screen.findByTestId('markdown-view-scroll')).toHaveProperty('scrollTop', 140);
  });

  it('restores editor selection and scroll snapshots across mode changes', async () => {
    renderEditor();
    fireEvent.click(screen.getByRole('button', { name: /编辑/ }));
    await screen.findByRole('textbox', { name: 'Markdown source' });
    fireEvent.click(screen.getByRole('button', { name: /查看/ }));
    await screen.findByRole('heading', { name: 'Read me' });
    fireEvent.click(screen.getByRole('button', { name: /编辑/ }));
    await screen.findByRole('textbox', { name: 'Markdown source' });

    expect(editorHarness.initialSnapshots).toEqual([null, { anchor: 3, head: 7, scrollTop: 96 }]);
  });

  it('clears both view and editor positions for a different file', async () => {
    const editor = renderEditor();
    const scroller = screen.getByTestId('markdown-view-scroll');
    Object.defineProperty(scroller, 'scrollTop', {
      configurable: true,
      value: 140,
      writable: true,
    });
    fireEvent.scroll(scroller);
    fireEvent.click(screen.getByRole('button', { name: /编辑/ }));
    await screen.findByRole('textbox', { name: 'Markdown source' });

    editor.rerenderEditor('/notes/b.md');
    const nextScroller = await screen.findByTestId('markdown-view-scroll');
    expect(nextScroller.scrollTop).toBe(0);

    fireEvent.click(screen.getByRole('button', { name: /编辑/ }));
    await screen.findByRole('textbox', { name: 'Markdown source' });
    expect(editorHarness.initialSnapshots[editorHarness.initialSnapshots.length - 1]).toBeNull();
  });
});
