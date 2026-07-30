# Note Mode Icon Toggle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the note editor's visible mode-toggle text with action-oriented edit and book icons plus shortcut tooltips.

**Architecture:** Keep all existing mode state, click handling, keyboard handling, and disabled behavior in `NoteEditor`. Change only the toggle's presentation and its focused assertions, using the existing `Button` component and `lucide-react`.

**Tech Stack:** React 18, TypeScript, Lucide React, Testing Library, Vitest

## Global Constraints

- View mode shows an edit icon that enters edit mode.
- Edit mode shows a book icon that returns to rendered view.
- The accessible name and native tooltip describe the target action and the existing platform-specific Cmd/Ctrl+E shortcut.
- Do not add a new shared tooltip component or change mode-transition behavior.

---

### Task 1: Render the mode toggle as an accessible icon button

**Files:**
- Modify: `apps/desktop/src/notes/NoteEditor.tsx:1-4,69,205-217`
- Test: `apps/desktop/src/notes/NoteEditor.test.tsx:215-280`

**Interfaces:**
- Consumes: existing `mode: 'view' | 'edit'`, `shortcutLabel: string`, and `toggleMode(): Promise<void>`
- Produces: an icon-only button whose `aria-label` and `title` are `${targetAction}（${shortcutLabel with display spacing}）`

- [ ] **Step 1: Write the failing view-mode presentation test**

Replace the existing toolbar shortcut assertion with:

```tsx
it('shows an icon-only edit action with the macOS shortcut tooltip in view mode', () => {
  const platform = vi.spyOn(window.navigator, 'platform', 'get').mockReturnValue('MacIntel');
  renderEditor();

  const toggle = screen.getByRole('button', { name: '编辑（⌘ + E）' });
  expect(toggle.getAttribute('title')).toBe('编辑（⌘ + E）');
  expect(toggle.textContent).toBe('');
  expect(toggle.querySelector('svg')).not.toBeNull();
  platform.mockRestore();
});
```

Extend the existing button-transition test after the editor appears:

```tsx
const toggle = screen.getByRole('button', { name: '查看（⌘ + E）' });
expect(toggle.getAttribute('title')).toBe('查看（⌘ + E）');
expect(toggle.textContent).toBe('');
expect(toggle.querySelector('svg')).not.toBeNull();
```

- [ ] **Step 2: Run the focused tests and verify RED**

Run:

```bash
pnpm --filter bkmrx test -- src/notes/NoteEditor.test.tsx
```

Expected: FAIL because the current button has visible `编辑 ⌘E` or `查看 ⌘E` text and does not expose the new tooltip names.

- [ ] **Step 3: Implement the minimal icon-button presentation**

Import Lucide icons:

```tsx
import { BookOpen, Pencil } from 'lucide-react';
```

Format the existing shortcut label for tooltip display:

```tsx
const shortcutHint = shortcutLabel === '⌘E' ? '⌘ + E' : 'Ctrl + E';
const modeToggleLabel = `${mode === 'view' ? '编辑' : '查看'}（${shortcutHint}）`;
```

Replace only the mode toggle presentation:

```tsx
<Button
  type="button"
  variant="ghost"
  size="icon-xs"
  aria-label={modeToggleLabel}
  title={modeToggleLabel}
  disabled={modeTransitionPending || (mode === 'edit' && !editorReady)}
  onClick={() => void toggleMode()}
>
  {mode === 'view' ? <Pencil aria-hidden="true" /> : <BookOpen aria-hidden="true" />}
</Button>
```

- [ ] **Step 4: Run focused tests and verify GREEN**

Run:

```bash
pnpm --filter bkmrx test -- src/notes/NoteEditor.test.tsx
```

Expected: all `NoteEditor.test.tsx` tests pass.

- [ ] **Step 5: Run desktop type/build verification**

Run:

```bash
pnpm --filter bkmrx build
```

Expected: TypeScript and Vite build complete successfully.

- [ ] **Step 6: Review the diff and commit**

Run:

```bash
git diff --check
git diff -- apps/desktop/src/notes/NoteEditor.tsx apps/desktop/src/notes/NoteEditor.test.tsx
git add apps/desktop/src/notes/NoteEditor.tsx apps/desktop/src/notes/NoteEditor.test.tsx
git commit -m "feat: use icons for note mode toggle"
```
