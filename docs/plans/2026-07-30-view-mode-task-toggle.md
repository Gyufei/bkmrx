# View-mode Task Checkbox Toggle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users toggle one GFM task checkbox directly in rendered note view mode while preserving the existing view/edit boundary and save pipeline.

**Architecture:** A pure source transformer toggles a task marker by AST source line. `MarkdownViewer` uses a list-item context to give enabled rendered checkboxes their source line, and `NoteEditor` applies the transformer through the existing `useNoteDocument` session.

**Tech Stack:** React 18, TypeScript, react-markdown, remark-gfm, Vitest, Testing Library

## Global Constraints

- Only GFM task-list checkboxes are interactive in view mode.
- The mode remains `view`; no hidden editor or second persistence path is introduced.
- Source line is the task identity; task text and global checkbox order are never used.
- Invalid or stale source positions are safe no-ops.
- Existing save debounce, queue, path/version guards, retry UI, scroll restoration, and editor snapshots remain unchanged.

---

### Task 1: Source-line task marker transformer

**Files:**
- Create: `apps/desktop/src/notes/toggle-markdown-task.ts`
- Test: `apps/desktop/src/notes/toggle-markdown-task.test.ts`

**Interfaces:**
- Consumes: Markdown source string and one-based AST source line.
- Produces: `toggleMarkdownTaskAtLine(content: string, sourceLine: number): string`.

- [ ] **Step 1: Write the failing transformer tests**

```ts
import { describe, expect, it } from 'vitest';
import { toggleMarkdownTaskAtLine } from './toggle-markdown-task';

describe('toggleMarkdownTaskAtLine', () => {
  it.each([
    ['- [ ] pending', '- [x] pending'],
    ['- [x] done', '- [ ] done'],
    ['  * [X] nested', '  * [ ] nested'],
    ['3.  [ ] ordered', '3.  [x] ordered'],
  ])('toggles only the GFM marker in %s', (input, expected) => {
    expect(toggleMarkdownTaskAtLine(input, 1)).toBe(expected);
  });

  it('targets duplicate labels by one-based source line and preserves CRLF', () => {
    const content = '- [ ] same\r\n- [ ] same\r\n';
    expect(toggleMarkdownTaskAtLine(content, 2)).toBe('- [ ] same\r\n- [x] same\r\n');
  });

  it.each([0, 3, Number.NaN])('ignores invalid source line %s', (line) => {
    expect(toggleMarkdownTaskAtLine('- [ ] task', line)).toBe('- [ ] task');
  });

  it('ignores ordinary bracket text and malformed task lines', () => {
    expect(toggleMarkdownTaskAtLine('paragraph [ ] text', 1)).toBe('paragraph [ ] text');
    expect(toggleMarkdownTaskAtLine('- [maybe] task', 1)).toBe('- [maybe] task');
  });
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `pnpm --filter bkmrx test -- src/notes/toggle-markdown-task.test.ts`

Expected: FAIL because `./toggle-markdown-task` does not exist.

- [ ] **Step 3: Implement the minimal pure transformation**

```ts
const TASK_MARKER = /^(\s*(?:[-+*]|\d+[.)])\s+\[)([ xX])(\])/;

export function toggleMarkdownTaskAtLine(content: string, sourceLine: number): string {
  if (!Number.isInteger(sourceLine) || sourceLine < 1) return content;

  const lines = content.split(/(\r?\n)/);
  const textIndex = (sourceLine - 1) * 2;
  const line = lines[textIndex];
  if (line === undefined || !TASK_MARKER.test(line)) return content;

  lines[textIndex] = line.replace(
    TASK_MARKER,
    (_, before: string, state: string, after: string) =>
      `${before}${state === ' ' ? 'x' : ' '}${after}`,
  );
  return lines.join('');
}
```

- [ ] **Step 4: Run the focused test and verify GREEN**

Run: `pnpm --filter bkmrx test -- src/notes/toggle-markdown-task.test.ts`

Expected: all transformer tests PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/notes/toggle-markdown-task.ts apps/desktop/src/notes/toggle-markdown-task.test.ts
git commit -m "feat: toggle markdown task by source line"
```

### Task 2: Interactive rendered checkbox

**Files:**
- Modify: `apps/desktop/src/notes/MarkdownViewer.tsx`
- Modify: `apps/desktop/src/notes/MarkdownViewer.test.tsx`
- Modify: `apps/desktop/src/App.css`

**Interfaces:**
- Consumes: `MarkdownViewerProps.onToggleTask?: (sourceLine: number) => void`.
- Produces: an enabled native checkbox when a task list item has a valid AST start line and the callback is present.

- [ ] **Step 1: Replace the disabled-checkbox assertion with failing interaction tests**

```tsx
it('reports the clicked task source line through an enabled checkbox', () => {
  const onToggleTask = vi.fn();
  render(
    <MarkdownViewer
      content={'- [ ] first\n\n  - [x] nested'}
      onToggleTask={onToggleTask}
    />,
  );

  const checkboxes = screen.getAllByRole('checkbox');
  expect(checkboxes[0]).toBeEnabled();
  expect(checkboxes[1]).toBeEnabled();
  fireEvent.click(checkboxes[1]);
  expect(onToggleTask).toHaveBeenCalledWith(3);
});

it('keeps task checkboxes disabled without a toggle callback', () => {
  render(<MarkdownViewer content="- [ ] task" />);
  expect(screen.getByRole('checkbox')).toBeDisabled();
});
```

Also extend the existing CSS assertion with:

```ts
expect(checkboxCss).toContain('cursor: pointer;');
```

- [ ] **Step 2: Run the viewer test and verify RED**

Run: `pnpm --filter bkmrx test -- src/notes/MarkdownViewer.test.tsx`

Expected: FAIL because the prop is absent and rendered inputs remain disabled.

- [ ] **Step 3: Add list-item source context and custom input rendering**

Add a nullable React context carrying the list item's `node.position?.start.line`.
Register custom `li` and `input` components alongside `table` and `a`. The `li`
component provides its start line; the `input` component removes react-markdown
metadata, preserves non-task inputs, and for `type="checkbox"` sets:

```tsx
disabled={!onToggleTask || sourceLine === null}
onChange={() => {
  if (sourceLine !== null) onToggleTask?.(sourceLine);
}}
```

Add `onToggleTask` to `MarkdownViewerProps`, and add `cursor: pointer;` only to
`.markdown-viewer .task-list-item > input[type='checkbox']:not(:disabled)`.

- [ ] **Step 4: Run the viewer test and verify GREEN**

Run: `pnpm --filter bkmrx test -- src/notes/MarkdownViewer.test.tsx`

Expected: all viewer tests PASS, including security and scroll behavior.

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/notes/MarkdownViewer.tsx apps/desktop/src/notes/MarkdownViewer.test.tsx apps/desktop/src/App.css
git commit -m "feat: enable task checkboxes in note view"
```

### Task 3: Note session integration

**Files:**
- Modify: `apps/desktop/src/notes/NoteEditor.tsx`
- Modify: `apps/desktop/src/notes/NoteEditor.test.tsx`

**Interfaces:**
- Consumes: `toggleMarkdownTaskAtLine(content, sourceLine)` and `MarkdownViewer.onToggleTask`.
- Produces: view-mode checkbox clicks update `session.content` through `session.setContent` without invoking `toggleMode`.

- [ ] **Step 1: Write a failing NoteEditor integration test**

Render a ready note containing two tasks with the existing dependency harness, click
the second rendered checkbox, and assert:

```ts
expect(screen.getByTestId('markdown-view-scroll')).toBeInTheDocument();
expect(save).toHaveBeenCalledWith(filePath, '- [ ] first\n- [x] second');
expect(screen.queryByTestId('markdown-source-editor')).not.toBeInTheDocument();
```

Use fake timers or the existing save harness to advance the current 400 ms debounce.
Click the same checkbox again after the rendered state updates and assert the next
saved content is `'- [ ] first\n- [ ] second'`.

- [ ] **Step 2: Run the focused integration test and verify RED**

Run: `pnpm --filter bkmrx test -- src/notes/NoteEditor.test.tsx`

Expected: FAIL because `NoteEditor` does not pass a task-toggle callback.

- [ ] **Step 3: Wire the pure transformer to the existing session**

Import `toggleMarkdownTaskAtLine`. Maintain a content ref synchronized from
`session.content`; in `handleToggleTask`, transform the ref's current value, update
the ref before calling `session.setContent(next)`, and skip `setContent` for a no-op.
Pass the stable callback to `MarkdownViewer` as `onToggleTask`.

- [ ] **Step 4: Run the integration and note-session tests**

Run:

```bash
pnpm --filter bkmrx test -- src/notes/NoteEditor.test.tsx src/notes/use-note-document.test.tsx src/notes/note-save-queue.test.ts
```

Expected: all tests PASS, including save failure and file-switch concurrency cases.

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/notes/NoteEditor.tsx apps/desktop/src/notes/NoteEditor.test.tsx
git commit -m "feat: persist view-mode task toggles"
```

### Task 4: Full verification

**Files:**
- Verify only; change production files only if a verification failure is caused by this feature.

**Interfaces:**
- Consumes: completed Tasks 1-3.
- Produces: fresh evidence that the desktop package remains healthy.

- [ ] **Step 1: Run desktop tests**

Run: `pnpm --filter bkmrx test`

Expected: exit 0 with no failed tests.

- [ ] **Step 2: Run desktop type checking**

Run: `pnpm --filter bkmrx exec tsc --noEmit`

Expected: exit 0 with no TypeScript errors.

- [ ] **Step 3: Run repository diff checks**

Run:

```bash
git diff --check
git status --short
```

Expected: no whitespace errors; status contains only the implementation-plan file
if it has not yet been committed.

- [ ] **Step 4: Commit the implementation plan if still uncommitted**

```bash
git add docs/superpowers/plans/2026-07-30-view-mode-task-toggle.md
git commit -m "docs: plan view-mode task toggle"
```
