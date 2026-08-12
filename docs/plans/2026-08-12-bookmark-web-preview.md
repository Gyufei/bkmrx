# Bookmark Web Preview Sheet Implementation Plan

**Goal:** Add a blocking right-side bookmark preview Sheet that loads HTTP(S) bookmarks in a sandboxed iframe while preserving title-based external opening and safely routing other protocols to the system.

**Architecture:** `BookmarkView` owns the selected preview bookmark so the Sheet can cover the search and result area. `ResultList` reports card preview intent while keeping title and action controls isolated. A dedicated `BookmarkWebPreview` component owns the shadcn Sheet shell, toolbar, loading state, iframe lifecycle and refresh behavior. URL classification and access recording remain explicit at the interaction boundary; the component boundary can later host a Tauri WebView without adding native WebView scope now.

**Tech Stack:** React 18, TypeScript, Tauri 2 shell plugin, Base UI-based shadcn components, Tailwind CSS 4, Vitest, Testing Library

**Requirement:** `docs/specs/bookmark-web-preview-spec.md`

## Global Constraints

- Only `http://` and `https://` URLs may enter the iframe.
- Non-HTTP(S) URLs must never create a blocking Sheet and must retain an error-free escape path.
- The iframe sandbox is exactly `allow-scripts allow-forms allow-same-origin` unless the requirement is explicitly revised.
- Opening the preview records one access; iframe refresh, internal navigation and toolbar external opening do not record again.
- The existing title external-open behavior and all bookmark action controls must remain intact.
- Loading illustration and animation design, metadata cards and Tauri child WebView work are out of scope.
- Existing unrelated Chrome extension changes must not be modified.

---

### Task 1: Add and verify the shadcn Sheet primitive

**Files:**

- Create: `apps/desktop/src/components/ui/sheet.tsx`
- Modify only if required by the generated component: `apps/desktop/package.json`
- Modify only if required by the generated component: `pnpm-lock.yaml`

- [ ] **Step 1: Inspect the project-aware shadcn configuration and Sheet registry item**

Run from `apps/desktop`:

```bash
pnpm dlx shadcn@latest info --json
pnpm dlx shadcn@latest docs sheet
pnpm dlx shadcn@latest add sheet --dry-run
```

Verify the component targets the current Base UI setup, `@/components/ui` alias, Tailwind 4 stylesheet and Lucide icon library. If network access remains unavailable, stop and request access rather than hand-writing an assumed upstream component.

- [ ] **Step 2: Add the Sheet through the shadcn CLI**

```bash
pnpm dlx shadcn@latest add sheet
```

Do not overwrite unrelated existing components. Read the generated source and verify that `SheetTitle` is available, overlay clicks can be prevented from closing, and the content width can be composed through `className` without modifying the primitive globally.

- [ ] **Step 3: Verify the generated component in isolation**

Run:

```bash
pnpm --filter bkmrx exec tsc --noEmit
git diff --check
```

Expected: the generated Sheet type-checks and introduces no unrelated formatting changes.

### Task 2: Build the isolated bookmark web preview component

**Files:**

- Create: `apps/desktop/src/bookmarks/BookmarkWebPreview.tsx`
- Create: `apps/desktop/src/bookmarks/BookmarkWebPreview.test.tsx`

**Interface:**

```ts
interface BookmarkWebPreviewProps {
  bookmark: Bookmark | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}
```

- [ ] **Step 1: Write failing component tests**

Cover:

- title and original domain rendering;
- iframe receives the original URL and exact sandbox tokens;
- loading is visible initially and hidden by iframe `load`;
- refresh replaces/reloads the iframe and restores loading without recording access;
- toolbar external-open calls the Tauri shell plugin but does not invoke access recording;
- close button and `Esc` close the Sheet;
- overlay pointer interaction does not close it;
- closing unmounts the iframe;
- `SheetTitle` is present for accessibility.

Mock Tauri shell calls and keep tests independent of a real remote page.

- [ ] **Step 2: Run the focused test and verify RED**

```bash
pnpm --filter bkmrx test -- src/bookmarks/BookmarkWebPreview.test.tsx
```

Expected: FAIL because the component does not exist.

- [ ] **Step 3: Implement the minimal component**

Implementation requirements:

- compose the generated `Sheet`, `SheetContent`, `SheetHeader` and `SheetTitle` primitives;
- position the right-side content so its left edge aligns with the 224px bookmark sidebar and it fills the remaining width;
- keep the app navigation visible while the Sheet overlay blocks all outside interaction;
- prevent overlay dismissal while preserving close-button and `Esc` dismissal;
- render title, domain, external-open, refresh and close controls in a fixed toolbar;
- use a local iframe key/version for refresh;
- render loading as a standalone replaceable region and hide it only after `load`;
- use the exact sandbox from the specification and do not add `allow` capabilities;
- do not add timeout, error detection, illustration assets or animation dependencies.

Use semantic design tokens and existing `Button` conventions. Do not create a generic browser abstraction or WebView adapter in this task.

- [ ] **Step 4: Run the focused test and verify GREEN**

```bash
pnpm --filter bkmrx test -- src/bookmarks/BookmarkWebPreview.test.tsx
```

Expected: all preview component tests PASS.

### Task 3: Add card-level preview intent without regressing controls

**Files:**

- Modify: `apps/desktop/src/bookmarks/ResultList.tsx`
- Modify: `apps/desktop/src/bookmarks/ResultList.test.tsx`

**Interface change:**

```ts
onPreviewBookmark: (bookmark: Bookmark, trigger: HTMLElement) => void;
```

- [ ] **Step 1: Write failing ResultList interaction tests**

Cover:

- clicking URL, description, access count or card background calls `onPreviewBookmark`;
- the triggering card element is reported for later focus restoration;
- clicking the title still calls system `open`, records access and does not request preview;
- clicking star and context-menu actions does not request preview;
- keyboard activation is available on the card preview target without making nested controls invalid.

- [ ] **Step 2: Run the focused test and verify RED**

```bash
pnpm --filter bkmrx test -- src/bookmarks/ResultList.test.tsx
```

Expected: new preview interaction assertions FAIL.

- [ ] **Step 3: Implement the minimal event boundary**

- Add the preview callback to `ResultList` and `BookmarkRow`.
- Make the card preview target keyboard accessible.
- Preserve the title's current external-open and access-record behavior.
- Stop propagation on the title, star and every independent action control.
- Do not move Sheet state into `ResultList`.

- [ ] **Step 4: Run the focused test and verify GREEN**

```bash
pnpm --filter bkmrx test -- src/bookmarks/ResultList.test.tsx
```

Expected: existing and new ResultList tests PASS.

### Task 4: Integrate preview state and safe protocol routing

**Files:**

- Modify: `apps/desktop/src/bookmarks/BookmarkView.tsx`
- Modify: `apps/desktop/src/bookmarks/BookmarkView.test.tsx`
- Reuse: `apps/desktop/src/bookmarks/BookmarkWebPreview.tsx`

- [ ] **Step 1: Write failing BookmarkView integration tests**

Cover:

- an HTTP(S) preview request selects the bookmark, opens the Sheet and records one access;
- preview refresh and toolbar external-open do not record additional access;
- a non-HTTP(S) request calls system `open` without creating the Sheet;
- successful non-HTTP(S) shell invocation records one access;
- rejected non-HTTP(S) shell invocation shows the existing toast, does not record access and leaves no overlay;
- closing clears the selected bookmark and returns focus to the original card;
- selecting preview does not mutate search, selected tags, base view or bookmark query state.

- [ ] **Step 2: Run the focused integration test and verify RED**

```bash
pnpm --filter bkmrx test -- src/bookmarks/BookmarkView.test.tsx
```

Expected: new integration assertions FAIL.

- [ ] **Step 3: Implement URL classification and Sheet ownership**

- Store the selected preview bookmark and triggering element in `BookmarkView`.
- Parse URLs with the platform `URL` API; only normalized `http:` and `https:` protocols may open the preview.
- For other protocols, call Tauri shell `open` before changing preview state.
- On shell rejection, use the existing toast API with a clear failure message and do not record access.
- On accepted HTTP(S) preview or non-HTTP(S) system-open call, record access once; keep the existing non-blocking logging behavior for access-record failures.
- On close, clear preview state and explicitly restore focus after the Sheet lifecycle permits it.
- Render one `BookmarkWebPreview` beside the existing page layout, not once per result row.

- [ ] **Step 4: Run bookmark-focused tests**

```bash
pnpm --filter bkmrx test -- src/bookmarks/BookmarkView.test.tsx src/bookmarks/ResultList.test.tsx src/bookmarks/BookmarkWebPreview.test.tsx
```

Expected: all bookmark preview and existing bookmark interaction tests PASS.

### Task 5: Regression verification and real Tauri smoke test

**Files:**

- Modify production or test files only when a failure is caused by this feature.
- Optionally append factual compatibility observations to `docs/specs/bookmark-web-preview-spec.md`; do not turn observations into unsupported guarantees.

- [ ] **Step 1: Run the complete desktop test suite**

```bash
pnpm --filter bkmrx test
```

Expected: exit 0 with no failed tests.

- [ ] **Step 2: Run type checking and production build**

```bash
pnpm --filter bkmrx exec tsc --noEmit
pnpm --filter bkmrx build
```

Expected: both commands exit 0.

- [ ] **Step 3: Run repository hygiene checks**

```bash
git diff --check
git status --short
```

Expected: no whitespace errors; unrelated pre-existing Chrome extension changes remain untouched.

- [ ] **Step 4: Perform a real Tauri smoke test**

Verify manually:

1. one embeddable HTTPS page loads and can navigate in-frame;
2. one site with iframe restrictions leaves the toolbar external-open escape available;
3. one HTTP page follows the same preview path, subject to platform mixed-content behavior;
4. one custom protocol bypasses the Sheet and fails safely if no handler exists;
5. opening, refreshing, closing, pressing `Esc`, attempting overlay dismissal and resizing the app preserve the specified interaction;
6. focus returns to the triggering card after close.

Record whether iframe compatibility appears acceptable. Do not begin a Tauri child WebView migration without a separate confirmed specification.

### Task 6: Review the completed change before merge

- [ ] **Step 1: Review only the feature diff**

Check every changed line against `docs/specs/bookmark-web-preview-spec.md`, with particular attention to nested click propagation, access-count duplication, modal focus behavior, URL protocol handling and iframe permissions.

- [ ] **Step 2: Re-run focused checks after review fixes**

Run the affected focused tests plus:

```bash
pnpm --filter bkmrx exec tsc --noEmit
git diff --check
```

Expected: all checks pass and no unrelated code has changed.
