# Markdown View/Edit Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the always-mounted Milkdown editor with a rendered-by-default Markdown view and a lazily loaded CodeMirror source editor without losing content during saves or file changes.

**Architecture:** Keep `NoteEditor(filePath)` as a thin right-pane controller. Move file reads, versioned content, debounce, flush, retry, and stale-session protection into `useNoteDocument`; render either a pure `MarkdownViewer` or a lazy `MarkdownSourceEditor` over the same in-memory content. Continue to serialize writes through the existing per-path `NoteSaveQueue`.

**Tech Stack:** React 18, TypeScript, Vite 5, Vitest 3, Testing Library, React Markdown, remark-gfm, Tailwind CSS 4, Tailwind Typography, CodeMirror 6, Tauri 2

## Global Constraints

- Every selected note opens in view mode.
- `Cmd/Ctrl + E` and a low-emphasis visible button toggle view/edit.
- `Cmd/Ctrl + S` saves immediately in edit mode only.
- Keep the existing 400 ms autosave delay.
- CommonMark, fenced code, GFM tables, and GFM task lists are the only required Markdown features.
- Raw HTML, math, Mermaid, MDX, syntax highlighting, workers, and parsed-output caching remain out of scope.
- The rendered view must not initialize CodeMirror.
- The first version must not add Shiki, Prism, highlight.js, DOMPurify, Marked, markdown-it, Monaco, or a global notification framework.
- Empty-string content is a valid save payload.
- Existing Rust Notes commands, absolute-path contracts, and frontmatter stripping/write-back behavior remain unchanged.
- Old reads must not replace a newer file's content.
- Every save must remain bound to its captured path, content, session, and content version.
- Save failure must retain the in-memory content and expose retry.
- Do not modify `NotesPanel` beyond the existing `<NoteEditor filePath={selectedFilePath} />` contract.
- Follow the approved design in `docs/superpowers/features/2026-07-28-markdown-view-edit-refactor-design.md`.

## File Structure

Create:

- `apps/desktop/src/notes/MarkdownViewer.tsx` — pure rendered Markdown body.
- `apps/desktop/src/notes/MarkdownViewer.test.tsx` — semantic Markdown rendering tests.
- `apps/desktop/src/notes/use-note-document.ts` — active document session, versioning, read/save lifecycle.
- `apps/desktop/src/notes/use-note-document.test.tsx` — stale-read, debounce, flush, retry, and file-change tests.
- `apps/desktop/src/notes/MarkdownSourceEditor.tsx` — CodeMirror adapter only.
- `apps/desktop/src/notes/MarkdownSourceEditor.test.tsx` — adapter lifecycle and change tests.
- `apps/desktop/src/notes/NoteEditor.test.tsx` — controller, toolbar, shortcuts, and transition tests.

Modify:

- `apps/desktop/src/notes/note-save-queue.test.ts` — extend the existing queue contract.
- `apps/desktop/src/notes/NoteEditor.tsx` — replace Crepe implementation with the thin controller.
- `apps/desktop/src/App.css` — register Typography, add Markdown/CodeMirror theme overrides, remove Crepe CSS.
- `apps/desktop/package.json` — add selected Markdown packages and later remove Milkdown.
- `pnpm-lock.yaml` — dependency graph changes.
- `docs/ARCHITECTURE.md` — describe rendered view, source editor, and current dependencies.

Do not create:

- a Notes context;
- a generic state machine;
- a Markdown parser abstraction;
- a shared notification service;
- a new Rust command.

---

### Task 1: Harden the Save Queue Contract

**Files:**

- Modify: `apps/desktop/src/notes/note-save-queue.test.ts`
- Verify: `apps/desktop/src/notes/note-save-queue.ts`

**Interfaces:**

- Consumes: `new NoteSaveQueue(write: (path: string, content: string) => Promise<void>)`
- Produces: confirmed behavior for `enqueue(path, content): Promise<void>` and `pending(path): Promise<void>`
- Produces: an explicit regression contract that empty strings reach the writer unchanged

- [ ] **Step 1: Add a failing test that `pending(path)` waits for the latest same-path write**

Append to the existing `describe('NoteSaveQueue', ...)`:

```ts
it('pending waits for the latest write on the requested path', async () => {
  const firstWrite = deferred();
  const secondWrite = deferred();
  const write = vi
    .fn<(path: string, content: string) => Promise<void>>()
    .mockReturnValueOnce(firstWrite.promise)
    .mockReturnValueOnce(secondWrite.promise);
  const queue = new NoteSaveQueue(write);

  void queue.enqueue('/a.md', 'first');
  void queue.enqueue('/a.md', 'second');
  const pending = queue.pending('/a.md');
  let settled = false;
  void pending.then(() => {
    settled = true;
  });

  firstWrite.resolve();
  await vi.waitFor(() => expect(write).toHaveBeenCalledTimes(2));
  expect(settled).toBe(false);

  secondWrite.resolve();
  await pending;
  expect(settled).toBe(true);
});
```

- [ ] **Step 2: Run the focused test**

Run:

```bash
pnpm --filter bkmrx exec vitest run src/notes/note-save-queue.test.ts
```

Expected: PASS if the existing `pending` implementation already satisfies the contract. If it fails, the failure must show that `pending` resolves before the current tail.

- [ ] **Step 3: Add failure-recovery and empty-content regression tests**

Append:

```ts
it('pending follows a later write after an earlier failure', async () => {
  const write = vi
    .fn<(path: string, content: string) => Promise<void>>()
    .mockRejectedValueOnce(new Error('disk full'))
    .mockResolvedValueOnce();
  const queue = new NoteSaveQueue(write);

  const failed = queue.enqueue('/a.md', 'old');
  const recovered = queue.enqueue('/a.md', 'new');

  await expect(failed).rejects.toThrow('disk full');
  await expect(queue.pending('/a.md')).resolves.toBeUndefined();
  await expect(recovered).resolves.toBeUndefined();
  expect(write).toHaveBeenNthCalledWith(2, '/a.md', 'new');
});

it('passes empty content to the writer unchanged', async () => {
  const write = vi.fn<(path: string, content: string) => Promise<void>>().mockResolvedValue();
  const queue = new NoteSaveQueue(write);

  await queue.enqueue('/empty.md', '');

  expect(write).toHaveBeenCalledWith('/empty.md', '');
});
```

- [ ] **Step 4: Run the focused tests and make the smallest queue fix only if required**

Run:

```bash
pnpm --filter bkmrx exec vitest run src/notes/note-save-queue.test.ts
```

Expected: all save queue tests PASS.

If the test exposes a real `pending` bug, change only `pending`/tail bookkeeping in
`note-save-queue.ts`. Do not add debounce, versioning, or UI state to the queue.

- [ ] **Step 5: Commit the queue contract**

```bash
git add apps/desktop/src/notes/note-save-queue.ts apps/desktop/src/notes/note-save-queue.test.ts
git commit -m "test: harden note save queue contract"
```

---

### Task 2: Add the Rendered Markdown View and Typography

**Files:**

- Create: `apps/desktop/src/notes/MarkdownViewer.tsx`
- Create: `apps/desktop/src/notes/MarkdownViewer.test.tsx`
- Modify: `apps/desktop/src/App.css`
- Modify: `apps/desktop/package.json`
- Modify: `pnpm-lock.yaml`

**Interfaces:**

- Consumes: `content: string`
- Produces:

```ts
export interface MarkdownViewerProps {
  content: string;
  initialScrollTop?: number;
  onScrollTopChange?(scrollTop: number): void;
}

export default function MarkdownViewer(props: MarkdownViewerProps): JSX.Element;
```

- Produces: `.markdown-viewer` as the narrow article styling hook
- Produces: `data-testid="markdown-table-scroll"` around every table

- [ ] **Step 1: Install the direct rendering dependencies**

Run:

```bash
pnpm --filter bkmrx add react-markdown remark-gfm
pnpm --filter bkmrx add -D @tailwindcss/typography
```

Expected: `apps/desktop/package.json` lists `react-markdown` and `remark-gfm`
under `dependencies`, `@tailwindcss/typography` under `devDependencies`, and
`pnpm-lock.yaml` changes.

- [ ] **Step 2: Write the failing semantic rendering tests**

Create `apps/desktop/src/notes/MarkdownViewer.test.tsx`:

```tsx
// @vitest-environment jsdom

import { fireEvent, render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { describe, expect, it } from 'vitest';

import MarkdownViewer from './MarkdownViewer';

describe('MarkdownViewer', () => {
  it('renders basic markdown, fenced code, a table, and task items', () => {
    render(
      <MarkdownViewer
        content={[
          '# Heading',
          '',
          '- [x] shipped',
          '- [ ] pending',
          '',
          '| Name | Value |',
          '| --- | --- |',
          '| A | 1 |',
          '',
          '```ts',
          'const value = 1;',
          '```',
        ].join('\n')}
      />,
    );

    expect(screen.getByRole('heading', { name: 'Heading' })).toBeTruthy();
    const checkboxes = screen.getAllByRole('checkbox');
    expect(checkboxes).toHaveLength(2);
    expect(checkboxes[0]).toBeChecked();
    expect(checkboxes[0]).toBeDisabled();
    expect(checkboxes[1]).not.toBeChecked();
    expect(checkboxes[1]).toBeDisabled();

    const tableScroll = screen.getByTestId('markdown-table-scroll');
    expect(within(tableScroll).getByRole('table')).toBeTruthy();
    expect(screen.getByText('const value = 1;').closest('code')?.className).toContain(
      'language-ts',
    );
  });

  it('does not turn raw html or dangerous urls into executable elements', () => {
    const { container } = render(
      <MarkdownViewer content={'<img src=x onerror=alert(1)>\n\n[bad](javascript:alert(1))'} />,
    );

    expect(container.querySelector('img')).toBeNull();
    expect(screen.getByText('bad').closest('a')?.getAttribute('href') ?? '').not.toMatch(
      /^javascript:/,
    );
  });

  it('renders a discoverable empty-note state', () => {
    render(<MarkdownViewer content="" />);

    expect(screen.getByText(/空白笔记/)).toBeTruthy();
    expect(screen.getByText(/⌘E|Ctrl E/)).toBeTruthy();
  });

  it('reports and restores the rendered-view scroll position', () => {
    const onScrollTopChange = vi.fn();
    render(
      <MarkdownViewer
        content="# Long note"
        initialScrollTop={120}
        onScrollTopChange={onScrollTopChange}
      />,
    );
    const scroller = screen.getByTestId('markdown-view-scroll');

    expect(scroller.scrollTop).toBe(120);
    Object.defineProperty(scroller, 'scrollTop', { configurable: true, value: 240 });
    fireEvent.scroll(scroller);
    expect(onScrollTopChange).toHaveBeenCalledWith(240);
  });
});
```

- [ ] **Step 3: Run the viewer test to verify it fails**

Run:

```bash
pnpm --filter bkmrx exec vitest run src/notes/MarkdownViewer.test.tsx
```

Expected: FAIL because `MarkdownViewer.tsx` does not exist.

- [ ] **Step 4: Implement the minimal viewer**

Create `apps/desktop/src/notes/MarkdownViewer.tsx`:

```tsx
import { useLayoutEffect, useRef, type ComponentPropsWithoutRef } from 'react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

export interface MarkdownViewerProps {
  content: string;
  initialScrollTop?: number;
  onScrollTopChange?(scrollTop: number): void;
}

function Table(props: ComponentPropsWithoutRef<'table'>) {
  return (
    <div data-testid="markdown-table-scroll" className="overflow-x-auto">
      <table {...props} />
    </div>
  );
}

export default function MarkdownViewer({
  content,
  initialScrollTop = 0,
  onScrollTopChange,
}: MarkdownViewerProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = initialScrollTop;
  }, [initialScrollTop]);

  return (
    <div
      ref={scrollRef}
      data-testid="markdown-view-scroll"
      className="h-full overflow-y-auto thin-scrollbar"
      onScroll={(event) => onScrollTopChange?.(event.currentTarget.scrollTop)}
    >
      {content ? (
        <article className="markdown-viewer prose prose-zinc dark:prose-invert mx-auto w-full px-6 py-8">
          <Markdown remarkPlugins={[remarkGfm]} components={{ table: Table }}>
            {content}
          </Markdown>
        </article>
      ) : (
        <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
          空白笔记 · 按 ⌘E 或 Ctrl E 开始编辑
        </div>
      )}
    </div>
  );
}
```

Do not add `rehype-raw` or `dangerouslySetInnerHTML`.

- [ ] **Step 5: Register Typography and add narrow theme-aligned overrides**

In `apps/desktop/src/App.css`, add after the Tailwind import:

```css
@plugin '@tailwindcss/typography';
```

Add a focused viewer block before the old Crepe block:

```css
.markdown-viewer {
  max-width: 72ch;
  --tw-prose-body: var(--foreground);
  --tw-prose-headings: var(--foreground);
  --tw-prose-links: var(--primary);
  --tw-prose-bold: var(--foreground);
  --tw-prose-counters: var(--muted-foreground);
  --tw-prose-bullets: var(--muted-foreground);
  --tw-prose-hr: var(--border);
  --tw-prose-quotes: var(--foreground);
  --tw-prose-quote-borders: var(--border);
  --tw-prose-code: var(--foreground);
  --tw-prose-pre-code: var(--foreground);
  --tw-prose-pre-bg: var(--muted);
  --tw-prose-th-borders: var(--border);
  --tw-prose-td-borders: var(--border);
}

.markdown-viewer pre,
.markdown-viewer code {
  font-family: 'JetBrains Mono', 'SF Mono', 'Cascadia Code', 'Fira Code', Menlo, Consolas,
    monospace;
}

.markdown-viewer pre {
  overflow-x: auto;
  border: 1px solid var(--border);
}

.markdown-viewer img {
  max-width: 100%;
}
```

Do not remove the Crepe styles in this task; `NoteEditor` still imports Crepe
until Task 5.

- [ ] **Step 6: Run the viewer tests**

Run:

```bash
pnpm --filter bkmrx exec vitest run src/notes/MarkdownViewer.test.tsx
```

Expected: 3 tests PASS.

- [ ] **Step 7: Build to verify Tailwind 4 accepts the plugin directive**

Run:

```bash
pnpm --filter bkmrx build
```

Expected: TypeScript and Vite build exit 0; generated CSS includes the
Typography classes.

- [ ] **Step 8: Commit the rendered view**

```bash
git add apps/desktop/package.json pnpm-lock.yaml apps/desktop/src/App.css \
  apps/desktop/src/notes/MarkdownViewer.tsx \
  apps/desktop/src/notes/MarkdownViewer.test.tsx
git commit -m "feat: add rendered markdown note view"
```

---

### Task 3: Build the Versioned Document Session Hook

**Files:**

- Create: `apps/desktop/src/notes/use-note-document.ts`
- Create: `apps/desktop/src/notes/use-note-document.test.tsx`
- Uses: `apps/desktop/src/notes/notes.api.ts`
- Uses: `apps/desktop/src/notes/note-save.ts`

**Interfaces:**

- Consumes:

```ts
export interface NoteDocumentDependencies {
  read(path: string): Promise<string>;
  save(path: string, content: string): Promise<void>;
  debounceMs: number;
}
```

- Produces:

```ts
export interface NoteSaveFailure {
  path: string;
  content: string;
  error: Error;
}

export interface NoteDocumentSession {
  content: string;
  loadState: 'loading' | 'ready' | 'error';
  loadError: Error | null;
  saveState: 'idle' | 'saving' | 'saved' | 'error';
  saveError: NoteSaveFailure | null;
  dirty: boolean;
  setContent(next: string): void;
  retryRead(): Promise<void>;
  flush(): Promise<void>;
  retrySave(): Promise<void>;
  dismissSaveError(): void;
}

export function useNoteDocument(
  filePath: string,
  dependencies?: Partial<NoteDocumentDependencies>,
): NoteDocumentSession;
```

- The production defaults are `readNoteContentApi`, `sharedNoteSaveQueue.enqueue`,
  and `debounceMs: 400`.
- `stripFrontmatter(content: string): string` remains local or exported from the
  hook module for focused tests.

- [ ] **Step 1: Write the failing read and stale-session tests**

Create `apps/desktop/src/notes/use-note-document.test.tsx` with jsdom, a
`deferred<T>()` helper, `renderHook`, and:

```tsx
// @vitest-environment jsdom

import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useNoteDocument } from './use-note-document';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('useNoteDocument reads', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('loads and strips the current note', async () => {
    const read = vi.fn().mockResolvedValue('---\ntitle: A\n---\n# A');
    const save = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() =>
      useNoteDocument('/a.md', { read, save, debounceMs: 400 }),
    );

    await waitFor(() => expect(result.current.loadState).toBe('ready'));
    expect(result.current.content).toBe('# A');
    expect(result.current.dirty).toBe(false);
  });

  it('ignores a late read from the previous path', async () => {
    const a = deferred<string>();
    const b = deferred<string>();
    const read = vi.fn((path: string) => (path === '/a.md' ? a.promise : b.promise));
    const save = vi.fn().mockResolvedValue(undefined);
    const { result, rerender } = renderHook(
      ({ path }) => useNoteDocument(path, { read, save, debounceMs: 400 }),
      { initialProps: { path: '/a.md' } },
    );

    rerender({ path: '/b.md' });
    b.resolve('# B');
    await waitFor(() => expect(result.current.content).toBe('# B'));
    a.resolve('# A');
    await act(async () => {
      await Promise.resolve();
    });

    expect(result.current.content).toBe('# B');
  });
});
```

- [ ] **Step 2: Run the hook tests to verify they fail**

Run:

```bash
pnpm --filter bkmrx exec vitest run src/notes/use-note-document.test.tsx
```

Expected: FAIL because the hook module does not exist.

- [ ] **Step 3: Implement reading, session IDs, and frontmatter stripping**

Create `use-note-document.ts` with:

- stable production defaults declared outside the hook;
- `sessionIdRef` incremented before each read;
- captured `path + sessionId` validation before setting content;
- `loadState` and `loadError`;
- `retryRead` reusing the same guarded read function;
- current `stripFrontmatter` behavior copied exactly from the old component.

Do not implement autosave yet beyond no-op placeholders required for the return
type.

- [ ] **Step 4: Run the read tests**

Run:

```bash
pnpm --filter bkmrx exec vitest run src/notes/use-note-document.test.tsx
```

Expected: read tests PASS.

- [ ] **Step 5: Add failing debounce, version, and empty-save tests**

Add tests that:

```tsx
it('debounces changes and saves only the latest captured content', async () => {
  const read = vi.fn().mockResolvedValue('start');
  const save = vi.fn().mockResolvedValue(undefined);
  const { result } = renderHook(() =>
    useNoteDocument('/a.md', { read, save, debounceMs: 400 }),
  );
  await waitFor(() => expect(result.current.loadState).toBe('ready'));

  act(() => {
    result.current.setContent('first');
    result.current.setContent('second');
    vi.advanceTimersByTime(399);
  });
  expect(save).not.toHaveBeenCalled();

  await act(async () => {
    vi.advanceTimersByTime(1);
    await Promise.resolve();
  });
  expect(save).toHaveBeenCalledTimes(1);
  expect(save).toHaveBeenCalledWith('/a.md', 'second');
});

it('saves an empty document', async () => {
  const read = vi.fn().mockResolvedValue('not empty');
  const save = vi.fn().mockResolvedValue(undefined);
  const { result } = renderHook(() =>
    useNoteDocument('/a.md', { read, save, debounceMs: 400 }),
  );
  await waitFor(() => expect(result.current.loadState).toBe('ready'));

  act(() => result.current.setContent(''));
  await act(async () => {
    await result.current.flush();
  });

  expect(save).toHaveBeenCalledWith('/a.md', '');
  expect(result.current.dirty).toBe(false);
});
```

Also add a controllable two-save test where the first save resolves after a
newer edit; assert the first completion does not set `dirty` to false or
`saveState` to `saved`.

- [ ] **Step 6: Implement versioned debounce and flush**

Use refs for:

```ts
currentPathRef;
currentSessionIdRef;
contentRef;
currentVersionRef;
latestSubmittedVersionRef;
latestSubmittedPromiseRef;
latestSavedVersionRef;
saveTimerRef;
```

Each write captures path, content, session, and version. State updates after a
write must validate those captured values. `flush()` cancels the timer, submits
the current version only if it is newer than `latestSubmittedVersion`, otherwise
awaits the already submitted save for that version.

Do not use `if (!content)` as a save guard.

- [ ] **Step 7: Run the hook tests**

Run:

```bash
pnpm --filter bkmrx exec vitest run src/notes/use-note-document.test.tsx
```

Expected: read, debounce, version, and empty-save tests PASS.

- [ ] **Step 8: Add failing file-change, retry, and cleanup tests**

Add tests for:

- dirty `/a.md` changes, rerender to `/b.md`, and assert the captured
  `/a.md + old content` is submitted immediately;
- old-path save rejection producing `saveError.path === '/a.md'` while B still
  loads;
- `retrySave()` resubmitting the captured failed content and clearing the error;
- read failure followed by `retryRead()` success;
- unmount clearing the debounce timer and producing no unhandled rejection.

Use controllable promises; do not use real time.

- [ ] **Step 9: Implement file-change snapshot submission and retries**

On path change:

- compare `currentVersion` with `latestSubmittedVersion`;
- enqueue only an unsubmitted current version;
- do not await before starting the new read;
- preserve a failed old-file snapshot as `NoteSaveFailure`;
- let `retrySave()` resubmit exactly that captured path/content;
- let `dismissSaveError()` clear only the displayed failure.

Ensure cleanup never submits the same version twice under React Strict Mode.

- [ ] **Step 10: Run hook and queue tests**

Run:

```bash
pnpm --filter bkmrx exec vitest run \
  src/notes/use-note-document.test.tsx \
  src/notes/note-save-queue.test.ts \
  src/notes/note-save.test.ts
```

Expected: all focused tests PASS with no unhandled rejection warnings.

- [ ] **Step 11: Commit the document session**

```bash
git add apps/desktop/src/notes/use-note-document.ts \
  apps/desktop/src/notes/use-note-document.test.tsx
git commit -m "feat: add versioned note document session"
```

---

### Task 4: Add the Lazy CodeMirror Source Editor Adapter

**Files:**

- Create: `apps/desktop/src/notes/MarkdownSourceEditor.tsx`
- Create: `apps/desktop/src/notes/MarkdownSourceEditor.test.tsx`
- Modify: `apps/desktop/src/App.css`

**Interfaces:**

- Consumes:

```ts
export interface MarkdownEditorSnapshot {
  anchor: number;
  head: number;
  scrollTop: number;
}

export interface MarkdownSourceEditorProps {
  value: string;
  initialSnapshot: MarkdownEditorSnapshot | null;
  onChange(value: string): void;
  onSnapshot(snapshot: MarkdownEditorSnapshot): void;
  onReady?(): void;
}
```

- Produces:

```ts
export default function MarkdownSourceEditor(
  props: MarkdownSourceEditorProps,
): JSX.Element;
```

- The component owns only CodeMirror lifecycle and UI state snapshots.

- [ ] **Step 1: Write failing adapter lifecycle tests**

Create `MarkdownSourceEditor.test.tsx` with jsdom. Mock `@codemirror/view` so
the test can observe construction, dispatch listener calls, and `destroy()`:

```tsx
// @vitest-environment jsdom

import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const editorHarness = vi.hoisted(() => {
  const destroy = vi.fn();
  return {
    destroy,
    view: {
      destroy,
      state: {
        selection: { main: { anchor: 0, head: 0 } },
        doc: { toString: () => '# Initial' },
      },
      scrollDOM: { scrollTop: 0 },
      focus: vi.fn(),
      dispatch: vi.fn(),
    },
  };
});

vi.mock('@codemirror/view', async (importOriginal) => {
  const original = await importOriginal<typeof import('@codemirror/view')>();
  return {
    ...original,
    EditorView: vi.fn(() => editorHarness.view),
  };
});

import MarkdownSourceEditor from './MarkdownSourceEditor';

describe('MarkdownSourceEditor', () => {
  it('creates and destroys one EditorView', () => {
    const { unmount } = render(
      <MarkdownSourceEditor
        value="# Initial"
        initialSnapshot={null}
        onChange={vi.fn()}
        onSnapshot={vi.fn()}
      />,
    );

    unmount();
    expect(editorHarness.destroy).toHaveBeenCalledTimes(1);
  });
});
```

If partially mocking CodeMirror proves brittle, replace the module mock with a
small injectable `createEditorView` factory exported only for tests. Do not
assert CodeMirror internals unrelated to this adapter.

- [ ] **Step 2: Run the adapter test to verify it fails**

Run:

```bash
pnpm --filter bkmrx exec vitest run src/notes/MarkdownSourceEditor.test.tsx
```

Expected: FAIL because `MarkdownSourceEditor.tsx` does not exist.

- [ ] **Step 3: Implement the minimal CodeMirror adapter**

Create one `EditorView` inside an effect using:

- `EditorState.create`;
- `markdown()` from `@codemirror/lang-markdown`;
- `history()` and standard command keymaps;
- `lineNumbers()`;
- `highlightActiveLine()`;
- `bracketMatching()`;
- `searchKeymap`;
- `keymap.of([...defaultKeymap, ...historyKeymap, ...searchKeymap, indentWithTab])`;
- `EditorView.updateListener` to call `onChange` only for document changes;
- a theme `Compartment`;
- initial selection from `initialSnapshot`;
- cleanup that reports the latest selection/scroll and destroys the view.

Keep callback props in refs so changing callbacks does not recreate the editor.
Observe `window.matchMedia('(prefers-color-scheme: dark)')`, reconfigure the
theme compartment on its `change` event, and remove the listener on cleanup.

- [ ] **Step 4: Add adapter behavior tests**

Extend the factory/mock to verify:

- initial `value` becomes the document;
- a simulated `docChanged` update calls `onChange` with the new document;
- cleanup calls `onSnapshot({ anchor, head, scrollTop })`;
- `onReady` fires after focus;
- rerendering with a changed color-scheme signal dispatches a compartment
  reconfiguration instead of constructing a second editor.

- [ ] **Step 5: Add minimal editor theme CSS**

Add to `App.css`:

```css
.markdown-source-editor,
.markdown-source-editor .cm-editor {
  height: 100%;
}

.markdown-source-editor .cm-scroller {
  overflow: auto;
  font-family: 'JetBrains Mono', 'SF Mono', 'Cascadia Code', 'Fira Code', Menlo, Consolas,
    monospace;
}

.markdown-source-editor .cm-editor {
  background: var(--background);
  color: var(--foreground);
}

.markdown-source-editor .cm-gutters {
  background: var(--background);
  color: var(--muted-foreground);
  border-color: var(--border);
}
```

Remove the old global `.ͼo .cm-activeLineGutter` override only in Task 6 after
the new editor is integrated.

- [ ] **Step 6: Run the adapter tests and build**

Run:

```bash
pnpm --filter bkmrx exec vitest run src/notes/MarkdownSourceEditor.test.tsx
pnpm --filter bkmrx build
```

Expected: adapter tests PASS and build exits 0.

- [ ] **Step 7: Commit the source editor adapter**

```bash
git add apps/desktop/src/notes/MarkdownSourceEditor.tsx \
  apps/desktop/src/notes/MarkdownSourceEditor.test.tsx \
  apps/desktop/src/App.css
git commit -m "feat: add markdown source editor adapter"
```

---

### Task 5: Replace Crepe with the View/Edit Controller

**Files:**

- Rewrite: `apps/desktop/src/notes/NoteEditor.tsx`
- Create: `apps/desktop/src/notes/NoteEditor.test.tsx`
- Uses: `apps/desktop/src/notes/use-note-document.ts`
- Uses: `apps/desktop/src/notes/MarkdownViewer.tsx`
- Lazy imports: `apps/desktop/src/notes/MarkdownSourceEditor.tsx`
- Uses: `apps/desktop/src/components/ui/button.tsx`

**Interfaces:**

- Keeps:

```ts
interface Props {
  filePath: string;
}

export default function NoteEditor({ filePath }: Props): JSX.Element;
```

- Consumes `useNoteDocument(filePath): NoteDocumentSession`.
- Consumes `MarkdownViewer({ content })`.
- Lazy consumes `MarkdownSourceEditorProps`.

- [ ] **Step 1: Write failing default-view and mode-button tests**

Create `NoteEditor.test.tsx`:

```tsx
// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const session = vi.hoisted(() => ({
  content: '# Read me',
  loadState: 'ready' as const,
  loadError: null,
  saveState: 'idle' as const,
  saveError: null,
  dirty: false,
  setContent: vi.fn(),
  retryRead: vi.fn(),
  flush: vi.fn().mockResolvedValue(undefined),
  retrySave: vi.fn().mockResolvedValue(undefined),
  dismissSaveError: vi.fn(),
}));

vi.mock('./use-note-document', () => ({
  useNoteDocument: vi.fn(() => session),
}));

vi.mock('./MarkdownSourceEditor', () => ({
  default: ({ value, onChange }: { value: string; onChange(value: string): void }) => (
    <textarea
      aria-label="Markdown source"
      value={value}
      onChange={(event) => onChange(event.target.value)}
    />
  ),
}));

import NoteEditor from './NoteEditor';

describe('NoteEditor', () => {
  beforeEach(() => {
    session.flush.mockClear();
    session.setContent.mockClear();
  });

  it('opens in rendered view and exposes a low-emphasis edit button', async () => {
    render(<NoteEditor filePath="/notes/a.md" />);

    expect(await screen.findByRole('heading', { name: 'Read me' })).toBeTruthy();
    expect(screen.getByRole('button', { name: /编辑/ })).toBeTruthy();
    expect(screen.queryByRole('textbox', { name: 'Markdown source' })).toBeNull();
  });

  it('enters source edit mode from the button', async () => {
    render(<NoteEditor filePath="/notes/a.md" />);
    fireEvent.click(screen.getByRole('button', { name: /编辑/ }));

    expect(await screen.findByRole('textbox', { name: 'Markdown source' })).toBeTruthy();
    expect(screen.getByRole('button', { name: /查看/ })).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run the controller tests to verify they fail**

Run:

```bash
pnpm --filter bkmrx exec vitest run src/notes/NoteEditor.test.tsx
```

Expected: FAIL because the current component mounts Crepe and has no view-mode
button.

- [ ] **Step 3: Implement the thin controller and toolbar**

Rewrite `NoteEditor.tsx` to:

- remove all Milkdown imports and instance refs;
- call `useNoteDocument(filePath)`;
- hold `mode`, `modeTransitionPending`, view scroll, and editor snapshot;
- reset mode and position state when `filePath` changes;
- render a 36 px header using existing theme classes;
- render the basename of `filePath` or a compact status;
- lazy import `./MarkdownSourceEditor`;
- show `MarkdownViewer` in view mode;
- show a `Suspense` loading body before the lazy editor is ready;
- show load error with a retry button;
- show background save error with file name, retry, and dismiss actions.
- pass the current `viewScrollTop` and an update callback to `MarkdownViewer`;
  save the latest `MarkdownEditorSnapshot` received from the source editor.

The mode button should use the existing `Button` component with `variant="ghost"`
and a compact size. Its accessible name includes `编辑` or `查看`.

- [ ] **Step 4: Run the first controller tests**

Run:

```bash
pnpm --filter bkmrx exec vitest run src/notes/NoteEditor.test.tsx
```

Expected: default-view and button-entry tests PASS.

- [ ] **Step 5: Add failing keyboard and save-transition tests**

Add tests for:

```tsx
it('toggles with Cmd/Ctrl+E and prevents the applicable default action', async () => {
  render(<NoteEditor filePath="/notes/a.md" />);
  const enter = new KeyboardEvent('keydown', { key: 'e', metaKey: true, cancelable: true });
  document.dispatchEvent(enter);
  expect(enter.defaultPrevented).toBe(true);
  expect(await screen.findByRole('textbox', { name: 'Markdown source' })).toBeTruthy();
});

it('waits for a dirty flush before returning to view mode', async () => {
  let resolveSave!: () => void;
  session.dirty = true;
  session.flush.mockReturnValueOnce(new Promise<void>((resolve) => {
    resolveSave = resolve;
  }));
  render(<NoteEditor filePath="/notes/a.md" />);
  fireEvent.click(screen.getByRole('button', { name: /编辑/ }));
  fireEvent.click(await screen.findByRole('button', { name: /查看/ }));

  expect(screen.getByRole('textbox', { name: 'Markdown source' })).toBeTruthy();
  resolveSave();
  await waitFor(() =>
    expect(screen.queryByRole('textbox', { name: 'Markdown source' })).toBeNull(),
  );
});

it('keeps the editor open when the exit flush fails', async () => {
  session.dirty = true;
  session.flush.mockRejectedValueOnce(new Error('disk full'));
  render(<NoteEditor filePath="/notes/a.md" />);
  fireEvent.click(screen.getByRole('button', { name: /编辑/ }));
  fireEvent.click(await screen.findByRole('button', { name: /查看/ }));

  expect(await screen.findByRole('textbox', { name: 'Markdown source' })).toBeTruthy();
  expect(session.flush).toHaveBeenCalledTimes(1);
});
```

Also test:

- `Cmd/Ctrl + S` calls `flush` and prevents default only in edit mode;
- repeated `Cmd/Ctrl + E` while flush is pending triggers one flush;
- changing `filePath` resets to view mode;
- unmount removes keyboard handlers;
- CodeMirror loading fallback disables the toggle.
- a `session.saveError` fixture renders the failed file name plus retry and
  dismiss actions, and each button invokes the matching session method.

Reset any mutated hoisted session properties in `beforeEach` so tests do not
leak state.

- [ ] **Step 6: Implement shortcut and transition guards**

Use one document-level `keydown` effect with current mode/transition refs:

- normalize `event.key.toLowerCase()`;
- apply `preventDefault()` only for supported current actions;
- route button and keyboard toggle through one `toggleMode()` function;
- when dirty, set `modeTransitionPending`, await `flush`, switch only on
  success, and clear the pending flag in `finally`;
- do not discard content on rejection;
- `Cmd/Ctrl + S` awaits or deliberately catches `flush()` so no unhandled
  rejection is created.

Store view scroll from the viewer container and the editor snapshot returned by
`MarkdownSourceEditor`. Reset both on `filePath` changes.

- [ ] **Step 7: Run all Notes frontend tests**

Run:

```bash
pnpm --filter bkmrx exec vitest run src/notes
```

Expected: queue, session, viewer, adapter, and controller tests all PASS.

- [ ] **Step 8: Build and inspect the lazy chunk**

Run:

```bash
pnpm --filter bkmrx build
rg -n "MarkdownSourceEditor|codemirror" apps/desktop/dist/assets
```

Expected: build exits 0 and CodeMirror/source-editor code appears in an
asynchronous asset rather than being initialized by the default view path.

- [ ] **Step 9: Commit the integrated view/edit controller**

```bash
git add apps/desktop/src/notes/NoteEditor.tsx \
  apps/desktop/src/notes/NoteEditor.test.tsx
git commit -m "feat: switch notes between rendered and source views"
```

---

### Task 6: Remove Milkdown, Update Architecture, and Verify the Refactor

**Files:**

- Modify: `apps/desktop/package.json`
- Modify: `pnpm-lock.yaml`
- Modify: `apps/desktop/src/App.css`
- Delete if unused: `apps/desktop/src/notes/config.ts`
- Modify: `docs/ARCHITECTURE.md`
- Verify all Notes files created in Tasks 1–5

**Interfaces:**

- Removes: Milkdown/Crepe runtime and dedicated CSS variables.
- Preserves: `NoteEditor({ filePath })`, Notes APIs, and save queue interfaces.
- Documents: `MarkdownViewer`, `useNoteDocument`, and lazy
  `MarkdownSourceEditor`.

- [ ] **Step 1: Prove Milkdown is no longer imported**

Run:

```bash
rg -n "@milkdown|Milkdown|Crepe|ProseMirror|MilkdownCreapConfig" \
  apps/desktop/src apps/desktop/package.json
```

Expected before cleanup: matches only in `App.css`, `package.json`, and
`src/notes/config.ts`; no match in `NoteEditor.tsx`.

If another production import remains, stop and remove it only when it belongs
to the old Notes editor.

- [ ] **Step 2: Remove the old dependency and obsolete config**

Run:

```bash
pnpm --filter bkmrx remove @milkdown/crepe
```

Delete `apps/desktop/src/notes/config.ts` only if the search proves it has no
remaining consumer.

Do not remove unrelated direct CodeMirror language packages in this refactor;
report them separately if they appear unused.

- [ ] **Step 3: Remove Crepe-specific CSS**

From `App.css`, delete:

- the `.milkdown` light theme variable block;
- the dark `.milkdown` media block;
- `.ProseMirror`;
- the generated-selector `.ͼo .cm-activeLineGutter` rule.

Keep:

- global color tokens;
- thin scrollbar;
- Typography viewer styles;
- scoped `.markdown-source-editor` CodeMirror styles;
- titlebar styles.

- [ ] **Step 4: Update the architecture document**

In `docs/ARCHITECTURE.md`:

- replace `Milkdown Crepe` in the stack table with
  `react-markdown + remark-gfm / CodeMirror 6`;
- replace the dependency entry for `@milkdown/crepe`;
- update the source tree description for `NoteEditor.tsx`;
- describe the view-first interaction and `Cmd/Ctrl + E`;
- document the 400 ms versioned autosave and per-path queue;
- remove obsolete Crepe toolbar suggestions;
- remove stale statements that `react-markdown` and `remark-gfm` are unused;
- update known risks to mention background old-file save reporting instead of
  the removed Crepe callback closure.

- [ ] **Step 5: Run the complete automated verification**

Run:

```bash
pnpm --filter bkmrx test
pnpm --filter bkmrx build
git diff --check
```

Expected:

- all Vitest files PASS with zero failures;
- TypeScript and Vite build exit 0;
- diff check produces no output.

- [ ] **Step 6: Verify the final dependency and bundle boundaries**

Run:

```bash
rg -n "@milkdown|Milkdown|Crepe|ProseMirror" apps/desktop/src apps/desktop/package.json
rg -n '"react-markdown"|"remark-gfm"|"@tailwindcss/typography"' apps/desktop/package.json
rg -n "shiki|prism|highlight\\.js|marked|markdown-it|monaco" \
  apps/desktop/package.json apps/desktop/src
find apps/desktop/dist/assets -maxdepth 1 -type f -print | sort
```

Expected:

- the Milkdown search returns no matches;
- all three selected packages are direct dependencies in the intended sections;
- forbidden/highlighter package search returns no matches attributable to this
  feature;
- build output contains a separate source-editor/CodeMirror-related chunk.

- [ ] **Step 7: Perform manual acceptance**

Use three local Markdown notes:

1. empty;
2. headings, nested lists, table, checked/unchecked tasks, fenced code;
3. long prose and a very long code line.

Verify:

- every file opens rendered;
- light and dark themes are readable;
- prose is centered at approximately 72ch;
- narrow panes retain horizontal padding;
- tables and code scroll horizontally;
- task checkboxes are disabled;
- the low-emphasis edit/view button remains visible and keyboard accessible;
- repeated rapid `Cmd/Ctrl + E` does not duplicate transitions;
- Chinese IME composition works;
- `Cmd/Ctrl + S` saves without leaving edit mode;
- clearing the entire document saves an empty file;
- a simulated save failure retains the editor content and exposes retry;
- rapid A/B selection never writes A content to B;
- view scroll and editor selection restore within one file session;
- the first edit dynamically loads, focuses, and remains usable.

Record any visual or platform-specific defect before declaring completion.

- [ ] **Step 8: Commit cleanup and documentation**

```bash
git add apps/desktop/package.json pnpm-lock.yaml apps/desktop/src/App.css \
  apps/desktop/src/notes/config.ts docs/ARCHITECTURE.md
git commit -m "refactor: remove milkdown note editor"
```

If `config.ts` was already absent, omit it from `git add`.

- [ ] **Step 9: Inspect the complete branch diff**

Run:

```bash
git status --short
git log --oneline --decorate -8
git diff HEAD~6..HEAD --stat
```

Expected:

- worktree clean;
- six focused implementation commits after the design/plan commits;
- diff limited to Notes frontend, selected dependencies, shared app CSS, tests,
  and architecture documentation.
