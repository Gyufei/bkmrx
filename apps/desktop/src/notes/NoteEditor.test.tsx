// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { startTransition, Suspense, useLayoutEffect, useRef, useState } from 'react';
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

const noteDocumentHarness = vi.hoisted(() => ({
  useReal: false,
  read: vi.fn<(path: string) => Promise<string>>(),
  save: vi.fn<(path: string, content: string) => Promise<void>>(),
  debounceMs: 60_000,
}));

vi.mock('./use-note-document', async (importOriginal) => {
  const original = await importOriginal<typeof import('./use-note-document')>();
  return {
    ...original,
    useNoteDocument: (filePath: string) =>
      noteDocumentHarness.useReal
        ? original.useNoteDocument(filePath, {
            read: noteDocumentHarness.read,
            save: noteDocumentHarness.save,
            debounceMs: noteDocumentHarness.debounceMs,
          })
        : session,
  };
});

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

function EditorCommitProbe({
  filePath,
  onCommit,
}: {
  filePath: string;
  onCommit?(textContent: string): void;
}) {
  const rootRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    onCommit?.(rootRef.current?.textContent ?? '');
  });

  return (
    <div ref={rootRef}>
      <NoteEditor filePath={filePath} />
    </div>
  );
}

let setConcurrentRoute: ((route: { filePath: string; suspended: boolean }) => void) | undefined;

function ConcurrentPathHarness({ suspension }: { suspension: Promise<void> }) {
  const [route, setRoute] = useState({
    filePath: '/notes/a.md',
    suspended: false,
  });
  setConcurrentRoute = setRoute;

  return (
    <Suspense fallback={<div>Pending route</div>}>
      <NoteEditor filePath={route.filePath} />
      {route.suspended ? <RouteSuspension suspension={suspension} /> : null}
    </Suspense>
  );
}

function RouteSuspension({ suspension }: { suspension: Promise<void> }): never {
  throw suspension;
}

function renderEditor(filePath = '/notes/a.md', onCommit?: (textContent: string) => void) {
  const queryClient = new QueryClient({
    defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
  });
  const result = render(
    <QueryClientProvider client={queryClient}>
      <EditorCommitProbe filePath={filePath} onCommit={onCommit} />
    </QueryClientProvider>,
  );
  return {
    ...result,
    rerenderEditor(nextFilePath: string) {
      result.rerender(
        <QueryClientProvider client={queryClient}>
          <EditorCommitProbe filePath={nextFilePath} onCommit={onCommit} />
        </QueryClientProvider>,
      );
    },
  };
}

function dispatchShortcut(
  key: string,
  modifiers: {
    metaKey?: boolean;
    ctrlKey?: boolean;
    shiftKey?: boolean;
    altKey?: boolean;
  } = { metaKey: true },
) {
  const event = new KeyboardEvent('keydown', {
    key,
    ...modifiers,
    cancelable: true,
  });
  act(() => document.dispatchEvent(event));
  return event;
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
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
    noteDocumentHarness.useReal = false;
    noteDocumentHarness.read.mockReset().mockResolvedValue('# Read me');
    noteDocumentHarness.save.mockReset().mockResolvedValue(undefined);
    noteDocumentHarness.debounceMs = 60_000;
    setConcurrentRoute = undefined;
  });

  it('opens in rendered view and exposes a low-emphasis edit button', async () => {
    renderEditor();

    expect(await screen.findByRole('heading', { name: 'Read me' })).toBeTruthy();
    expect(screen.getByRole('button', { name: /编辑/ })).toBeTruthy();
    expect(screen.queryByRole('textbox', { name: 'Markdown source' })).toBeNull();
    expect(editorHarness.mounts).toBe(0);
  });

  it('coalesces rapid rendered-view task toggles into one saved snapshot', async () => {
    noteDocumentHarness.useReal = true;
    noteDocumentHarness.read.mockResolvedValue('- [ ] first\n- [ ] second');
    noteDocumentHarness.debounceMs = 400;
    const filePath = '/notes/tasks.md';
    renderEditor(filePath);
    const checkboxes = await screen.findAllByRole('checkbox');

    vi.useFakeTimers();
    try {
      fireEvent.click(checkboxes[0]);
      fireEvent.click(screen.getAllByRole('checkbox')[1]);

      expect(screen.getByTestId('markdown-view-scroll')).toBeInTheDocument();
      expect(screen.queryByTestId('markdown-source-editor')).not.toBeInTheDocument();
      expect(screen.queryByRole('textbox', { name: 'Markdown source' })).not.toBeInTheDocument();
      expect(noteDocumentHarness.save).not.toHaveBeenCalled();
      act(() => vi.advanceTimersByTime(400));
      expect(noteDocumentHarness.save).toHaveBeenCalledTimes(1);
      expect(noteDocumentHarness.save).toHaveBeenCalledWith(filePath, '- [x] first\n- [x] second');
      expect(screen.getByTestId('markdown-view-scroll')).toBeInTheDocument();
      expect(screen.queryByRole('textbox', { name: 'Markdown source' })).not.toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it('shows an icon-only edit action with the macOS shortcut tooltip in view mode', () => {
    const platform = vi.spyOn(window.navigator, 'platform', 'get').mockReturnValue('MacIntel');
    try {
      renderEditor();

      const toggle = screen.getByRole('button', { name: '编辑（⌘ + E）' });
      expect(toggle.getAttribute('title')).toBe('编辑（⌘ + E）');
      expect(toggle.textContent).toBe('');
      expect(toggle.querySelector('.lucide-pencil')).not.toBeNull();
    } finally {
      platform.mockRestore();
    }
  });

  it('shows the Ctrl+E shortcut tooltip on non-macOS platforms', () => {
    const platform = vi.spyOn(window.navigator, 'platform', 'get').mockReturnValue('Linux x86_64');
    try {
      renderEditor();

      const toggle = screen.getByRole('button', { name: '编辑（Ctrl + E）' });
      expect(toggle.getAttribute('title')).toBe('编辑（Ctrl + E）');
    } finally {
      platform.mockRestore();
    }
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

  it('shows the saving status while editing', async () => {
    session.saveState = 'saving';
    renderEditor();
    fireEvent.click(screen.getByRole('button', { name: /编辑/ }));
    await screen.findByRole('textbox', { name: 'Markdown source' });

    expect(screen.getByRole('status').textContent).toBe('保存中...');
  });

  it('shows a saved status transiently while editing', async () => {
    vi.useFakeTimers();
    const editor = renderEditor();
    fireEvent.click(screen.getByRole('button', { name: /编辑/ }));
    session.saveState = 'saved';
    editor.rerenderEditor('/notes/a.md');

    expect(screen.getByRole('status').textContent).toBe('已保存');
    act(() => vi.advanceTimersByTime(1_500));
    expect(screen.queryByRole('status')).toBeNull();

    editor.unmount();
    vi.useRealTimers();
  });

  it('enters source edit mode from the button', async () => {
    const platform = vi.spyOn(window.navigator, 'platform', 'get').mockReturnValue('MacIntel');
    try {
      renderEditor();
      fireEvent.click(screen.getByRole('button', { name: /编辑/ }));

      expect(await screen.findByRole('textbox', { name: 'Markdown source' })).toBeTruthy();
      const toggle = screen.getByRole('button', { name: '查看（⌘ + E）' });
      expect(toggle.getAttribute('title')).toBe('查看（⌘ + E）');
      expect(toggle.textContent).toBe('');
      expect(toggle.querySelector('.lucide-book-open')).not.toBeNull();
    } finally {
      platform.mockRestore();
    }
  });

  it('toggles with Cmd/Ctrl+E and prevents the applicable default action', async () => {
    renderEditor();
    const enter = dispatchShortcut('E');

    expect(enter.defaultPrevented).toBe(true);
    expect(await screen.findByRole('textbox', { name: 'Markdown source' })).toBeTruthy();
  });

  it.each([
    ['Shift', { metaKey: true, shiftKey: true }],
    ['Alt', { ctrlKey: true, altKey: true }],
  ])('ignores %s-modified mode shortcuts', (_name, modifiers) => {
    renderEditor();

    const event = dispatchShortcut('e', modifiers);

    expect(event.defaultPrevented).toBe(false);
    expect(screen.queryByRole('textbox', { name: 'Markdown source' })).toBeNull();
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

  it.each([
    ['Shift', { metaKey: true, shiftKey: true }],
    ['Alt', { ctrlKey: true, altKey: true }],
  ])('ignores %s-modified save shortcuts', async (_name, modifiers) => {
    renderEditor();
    fireEvent.click(screen.getByRole('button', { name: /编辑/ }));
    await screen.findByRole('textbox', { name: 'Markdown source' });

    const event = dispatchShortcut('s', modifiers);

    expect(event.defaultPrevented).toBe(false);
    expect(session.flush).not.toHaveBeenCalled();
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

  it('isolates exit flush generations across A to B to A transitions', async () => {
    const firstFlush = deferred<void>();
    const secondFlush = deferred<void>();
    session.dirty = true;
    session.flush.mockReturnValueOnce(firstFlush.promise).mockReturnValueOnce(secondFlush.promise);
    const editor = renderEditor('/notes/a.md');

    fireEvent.click(screen.getByRole('button', { name: /编辑/ }));
    await screen.findByRole('textbox', { name: 'Markdown source' });
    fireEvent.click(screen.getByRole('button', { name: /查看/ }));
    editor.rerenderEditor('/notes/b.md');
    editor.rerenderEditor('/notes/a.md');

    fireEvent.click(screen.getByRole('button', { name: /编辑/ }));
    await screen.findByRole('textbox', { name: 'Markdown source' });
    fireEvent.click(screen.getByRole('button', { name: /查看/ }));
    expect(session.flush).toHaveBeenCalledTimes(2);

    await act(async () => {
      firstFlush.resolve();
      await firstFlush.promise;
    });
    expect(screen.getByRole('textbox', { name: 'Markdown source' })).toBeTruthy();

    await act(async () => {
      secondFlush.reject(new Error('second flush failed'));
      await secondFlush.promise.catch(() => undefined);
    });
    expect(screen.getByRole('textbox', { name: 'Markdown source' })).toBeTruthy();
    expect(screen.getByRole('button', { name: /查看/ }).hasAttribute('disabled')).toBe(false);
  });

  it('does not invalidate the committed path flush for an abandoned path render', async () => {
    const flush = deferred<void>();
    const suspension = deferred<void>();
    session.dirty = true;
    session.flush.mockReturnValueOnce(flush.promise);
    const queryClient = new QueryClient({
      defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
    });
    render(
      <QueryClientProvider client={queryClient}>
        <ConcurrentPathHarness suspension={suspension.promise} />
      </QueryClientProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: /编辑/ }));
    await screen.findByRole('textbox', { name: 'Markdown source' });
    fireEvent.click(screen.getByRole('button', { name: /查看/ }));

    act(() => {
      startTransition(() => {
        setConcurrentRoute?.({ filePath: '/notes/b.md', suspended: true });
      });
    });
    expect(screen.getByRole('textbox', { name: 'Markdown source' })).toBeTruthy();

    await act(async () => {
      flush.resolve();
      await flush.promise;
    });

    expect(await screen.findByRole('heading', { name: 'Read me' })).toBeTruthy();
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

  it('does not expose the previous document on the first commit for a new path', async () => {
    const nextRead = deferred<string>();
    const commits: string[] = [];
    noteDocumentHarness.useReal = true;
    noteDocumentHarness.read.mockImplementation((path) =>
      path === '/notes/a.md' ? Promise.resolve('# A private') : nextRead.promise,
    );
    const editor = renderEditor('/notes/a.md', (textContent) => commits.push(textContent));
    expect(await screen.findByRole('heading', { name: 'A private' })).toBeTruthy();

    commits.length = 0;
    editor.rerenderEditor('/notes/b.md');

    expect(commits.length).toBeGreaterThan(0);
    expect(commits[0]).not.toContain('A private');
    expect(commits[0]).not.toContain('编辑');
    expect(screen.queryByRole('heading', { name: 'A private' })).toBeNull();
    expect(screen.queryByRole('button', { name: /编辑/ })).toBeNull();
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

  it('can save the same dirty snapshot after dismissing its failure', async () => {
    noteDocumentHarness.useReal = true;
    noteDocumentHarness.read.mockResolvedValue('# Start');
    noteDocumentHarness.save
      .mockRejectedValueOnce(new Error('disk full'))
      .mockResolvedValueOnce(undefined);
    renderEditor('/notes/a.md');
    expect(await screen.findByRole('heading', { name: 'Start' })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /编辑/ }));
    const source = await screen.findByRole('textbox', { name: 'Markdown source' });
    fireEvent.change(source, { target: { value: '# Recovered' } });
    fireEvent.click(screen.getByRole('button', { name: /查看/ }));
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(screen.getByRole('textbox', { name: 'Markdown source' })).toHaveProperty(
      'value',
      '# Recovered',
    );

    fireEvent.click(screen.getByRole('button', { name: '忽略' }));
    expect(screen.queryByRole('alert')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /查看/ }));

    expect(await screen.findByRole('heading', { name: 'Recovered' })).toBeTruthy();
    expect(noteDocumentHarness.save).toHaveBeenCalledTimes(2);
    expect(noteDocumentHarness.save).toHaveBeenNthCalledWith(2, '/notes/a.md', '# Recovered');
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
