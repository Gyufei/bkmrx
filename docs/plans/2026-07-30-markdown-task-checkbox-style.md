# Markdown Task Checkbox Style Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make rendered Markdown task checkboxes 16px, theme-colored, and visually aligned with their task text.

**Architecture:** Add one narrowly scoped CSS rule under `.markdown-viewer .task-list-item` and protect its visual contract with the existing App.css-backed Markdown viewer tests. Preserve remark-gfm markup and native checkbox behavior.

**Tech Stack:** CSS, React 18, react-markdown, remark-gfm, Vitest

## Global Constraints

- Apply the style only to checkbox inputs inside rendered Markdown task-list items.
- Keep the native checkbox appearance and disabled semantics.
- Use `1rem` dimensions and `var(--primary)` accent color.
- Do not change ordinary lists, edit mode, or reusable form controls.

---

### Task 1: Style rendered Markdown task checkboxes

**Files:**
- Modify: `apps/desktop/src/App.css:194-213`
- Test: `apps/desktop/src/notes/MarkdownViewer.test.tsx:160-180`

**Interfaces:**
- Consumes: remark-gfm's `.task-list-item > input[type='checkbox']` markup
- Produces: a viewer-scoped CSS contract for size, color, margin, and vertical alignment

- [ ] **Step 1: Write the failing CSS-contract test**

Add:

```tsx
it('sizes and aligns rendered task checkboxes with the application accent color', () => {
  const checkboxCss =
    appCss.match(
      /\.markdown-viewer \.task-list-item > input\[type='checkbox'\] \{([^}]*)}/,
    )?.[1] ?? '';

  expect(checkboxCss).toContain('width: 1rem;');
  expect(checkboxCss).toContain('height: 1rem;');
  expect(checkboxCss).toContain('margin: 0 0.375rem 0 0;');
  expect(checkboxCss).toContain('vertical-align: -0.125em;');
  expect(checkboxCss).toContain('accent-color: var(--primary);');
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```bash
pnpm --filter bkmrx test -- src/notes/MarkdownViewer.test.tsx
```

Expected: FAIL because App.css does not contain the viewer task-checkbox rule.

- [ ] **Step 3: Add the minimal viewer-scoped CSS**

Add after the existing `.markdown-viewer img` rule:

```css
.markdown-viewer .task-list-item > input[type='checkbox'] {
  width: 1rem;
  height: 1rem;
  margin: 0 0.375rem 0 0;
  vertical-align: -0.125em;
  accent-color: var(--primary);
}
```

- [ ] **Step 4: Run the focused test and verify GREEN**

Run:

```bash
pnpm --filter bkmrx test -- src/notes/MarkdownViewer.test.tsx
```

Expected: all desktop tests pass, including the new checkbox style contract.

- [ ] **Step 5: Run production verification**

Run:

```bash
pnpm --filter bkmrx build
git diff --check
```

Expected: TypeScript and Vite build successfully, and the diff has no whitespace errors.

- [ ] **Step 6: Commit the implementation**

Run:

```bash
git add apps/desktop/src/App.css apps/desktop/src/notes/MarkdownViewer.test.tsx
git commit -m "style: improve markdown task checkboxes"
```
