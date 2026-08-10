# Markdown View/Edit Refactor Design

**Date:** 2026-07-28
**Status:** Approved in conversation; awaiting written-spec review
**Scope:** Desktop Notes frontend only

## 1. Purpose

Replace the always-mounted Milkdown Crepe WYSIWYG editor with a read-first
Markdown experience:

- every selected note opens in a rendered view;
- `Cmd/Ctrl + E` or a low-emphasis button switches to source editing;
- source editing uses CodeMirror 6 and loads only when first needed;
- the rendered view uses `react-markdown`, `remark-gfm`, and Tailwind
  Typography;
- existing per-path save serialization remains in use;
- no note content is lost during mode changes or rapid file changes.

The library comparison and rejected technology routes are recorded in
[`docs/markdown-view-edit-refactor-selection.md`](../../markdown-view-edit-refactor-selection.md).
This document does not repeat that analysis. It defines the implementation
architecture and observable behavior selected from it.

## 2. Current State

`apps/desktop/src/notes/NoteEditor.tsx` currently owns all of the following:

- note reads;
- frontmatter stripping;
- Crepe construction and destruction;
- the current Markdown value;
- a 400 ms save debounce;
- `Cmd/Ctrl + S`;
- save status rendering;
- pending-save cleanup during file changes.

The component passes captured `path + content` values into
`sharedNoteSaveQueue`. `NoteSaveQueue` already serializes writes for the same
path and allows different paths to write independently.

`NotesPanel` supplies only `filePath` to `NoteEditor`. That external interface
is sufficient for the new design and remains unchanged.

## 3. Goals

- Default to a polished rendered view for every selected note.
- Keep source editing discoverable without making editing controls visually
  dominant.
- Avoid loading or initializing CodeMirror while the user is only reading.
- Support CommonMark plus GFM tables and task lists.
- Render fenced code blocks without syntax highlighting in the first version.
- Disable raw HTML rendering.
- Preserve the existing 400 ms autosave behavior.
- Make manual save and edit-to-view transitions deterministic.
- Prevent stale reads and stale saves from changing the active note state.
- Allow an empty note to be saved.
- Preserve current Notes backend contracts and frontmatter behavior.

## 4. Non-goals

- WYSIWYG or rich-text editing.
- Math, Mermaid, raw HTML, MDX, footnotes, or custom Markdown extensions.
- Interactive task checkboxes in the rendered view.
- Syntax highlighting.
- Worker-based parsing.
- parsed-output caching.
- pixel-perfect synchronized scrolling between rendered and source views.
- persistent editor selections across application restarts.
- changes to Rust Notes commands, absolute-path handling, or frontmatter
  semantics.
- a global notification framework.

## 5. Chosen Architecture

Keep `NoteEditor` as the public right-pane component, but turn it into a thin
session controller.

```text
NotesPanel
└── NoteEditor(filePath)
    ├── useNoteDocument(filePath)
    ├── NoteToolbar
    ├── MarkdownViewer
    └── Lazy MarkdownSourceEditor
```

### 5.1 `NoteEditor`

Responsibilities:

- own `mode: 'view' | 'edit'`;
- install and remove keyboard shortcuts;
- coordinate mode transitions;
- select the appropriate body component;
- keep view and editor position metadata for the current file;
- render the toolbar and persistent background-save errors.

It does not parse Markdown, instantiate CodeMirror, call the Tauri read/write
APIs directly, or implement save ordering.

`filePath` remains its only required prop.

### 5.2 `useNoteDocument`

Responsibilities:

- read the current file;
- reject stale read results;
- hold the single in-memory Markdown value;
- preserve the current `stripFrontmatter` behavior;
- track content versions and dirty state;
- schedule 400 ms autosaves;
- flush the latest snapshot on demand;
- submit old-file snapshots during file changes;
- expose load and save state;
- retain retry information for failed writes.

The hook is the only owner of the mutable note content. The viewer and editor
must not maintain independent content copies.

Conceptual return shape:

```ts
interface NoteDocumentSession {
  content: string;
  loadState: 'loading' | 'ready' | 'error';
  loadError: Error | null;
  saveState: 'idle' | 'saving' | 'saved' | 'error';
  saveError: NoteSaveError | null;
  dirty: boolean;
  setContent(next: string): void;
  retryRead(): Promise<void>;
  flush(): Promise<void>;
  retrySave(): Promise<void>;
}
```

The exact TypeScript shape may differ if a smaller interface satisfies the
same behavior. The implementation must not introduce a generic state machine
or context.

### 5.3 `MarkdownViewer`

Responsibilities:

- render `content` using `react-markdown`;
- enable `remark-gfm`;
- supply element mappings needed for tables, links, images, code, and task
  checkboxes;
- render a lightweight empty-note state;
- apply the Markdown reading style.

It receives content and presentation callbacks only. It does not read or save
files.

### 5.4 `MarkdownSourceEditor`

Responsibilities:

- create and destroy a CodeMirror `EditorView`;
- configure Markdown editing extensions;
- notify the controller when the document changes;
- restore the current-session selection and scroll position;
- update the light/dark theme without discarding the document;
- focus after successful mounting.

The component is loaded with `React.lazy` or an equivalent dynamic import. It
does not save files.

### 5.5 `NoteToolbar`

Responsibilities:

- show a low-emphasis `编辑 ⌘E` button in view mode;
- show a low-emphasis `查看 ⌘E` button in edit mode;
- show transient or actionable save state;
- disable repeated mode changes while an edit-to-view flush is running.

The toolbar contains no Markdown formatting controls.

## 6. Session State

The controller-level state is deliberately small:

```ts
type NoteMode = 'view' | 'edit';

interface NoteUiState {
  mode: NoteMode;
  modeTransitionPending: boolean;
  viewScrollTop: number;
  editorSelection: EditorSelectionSnapshot | null;
  editorScrollTop: number;
}
```

The document hook owns:

- the active path;
- a session identifier;
- content;
- the current content version;
- the latest version submitted to the save queue;
- the latest successfully saved content/version;
- dirty state;
- debounce timer;
- load and save states;
- retry snapshots.

## 7. Read Lifecycle

When `filePath` changes:

1. Capture the old session's path, content, version, and dirty state.
2. Cancel the old session's debounce timer.
3. If the old session's current version is newer than its latest submitted
   version, enqueue the captured `oldPath + oldContent` snapshot without
   waiting for it to finish.
4. Reset the UI to view mode and loading state.
5. Increment a monotonically increasing `sessionId`.
6. Read the new path.
7. On completion, commit the result only if both the captured `sessionId` and
   captured path still match the active session.
8. Strip frontmatter using the existing behavior.
9. Initialize content, last-saved content, and version as clean.

A late result from an older file must be ignored.

The previous note's rendered content must not remain visible under the new
selection while the new note is loading.

## 8. Edit and Autosave Lifecycle

Every CodeMirror document change:

1. updates the single in-memory `content`;
2. increments `contentVersion`;
3. marks the session dirty;
4. cancels and replaces the 400 ms timer.

When the timer fires, it captures:

```text
targetPath
contentSnapshot
versionSnapshot
sessionId
```

It then calls:

```ts
sharedNoteSaveQueue.enqueue(targetPath, contentSnapshot)
```

A successful write may mark the active session as saved only when:

- the active path still equals `targetPath`;
- the active session still equals the captured session;
- `versionSnapshot` equals the active content version;
- the active content still equals `contentSnapshot`.

An older successful write advances the queue but must not mark newer content as
saved.

Dirty state, not string truthiness, decides whether a write is required. An
empty string is a valid save payload.

## 9. Manual Save

`Cmd/Ctrl + S` is intercepted only in edit mode.

Manual save:

1. cancels the debounce timer;
2. captures the current path, content, version, and session;
3. enqueues the snapshot immediately;
4. waits for that write;
5. remains in edit mode on both success and failure;
6. reports saved state only when the saved snapshot is still current;
7. retains all in-memory content and exposes retry on failure.

Repeated manual saves remain safe because `NoteSaveQueue` serializes writes for
the path.

## 10. Mode Transitions

### 10.1 View to edit

- Triggered by `Cmd/Ctrl + E` or the toolbar button.
- Starts the lazy editor import if this is the first edit.
- Shows a small loading state while the chunk initializes.
- Temporarily disables the mode button.
- Mounts CodeMirror with the current in-memory content.
- Restores the current-file session selection and editor scroll position when
  available.
- Otherwise places the cursor at the start of the document.
- Focuses the editor after mounting.

The cursor must not be moved to the document end by default.

### 10.2 Edit to view

If the document is clean, switch immediately.

If the document is dirty:

1. mark the mode transition as pending;
2. cancel the debounce timer;
3. flush and await the current snapshot;
4. switch to view mode only after success;
5. on failure, remain in edit mode with the content intact and expose retry.

Repeated `Cmd/Ctrl + E` events while the transition is pending are ignored.

The rendered view uses the same in-memory content, so a successful transition
does not reread the file.

## 11. File Changes and Background Save Failures

Changing the selected file must remain responsive. A pending old-file snapshot
is captured and queued under the old path, while the new file begins loading.
The active pane does not wait for the old write.

If that background write fails:

- the error must not exist only in console output;
- the note pane shows a persistent error strip naming the failed file;
- the retry action resubmits the captured path and content;
- viewing the new file remains possible;
- the error clears after a successful retry or an explicit dismissal.

If the entire Notes page unmounts before the asynchronous failure is available,
console reporting remains the last-resort first-version fallback. This design
does not add a global notification system.

## 12. Keyboard Behavior

- `Cmd/Ctrl + E`: toggle view/edit for the selected note.
- `Cmd/Ctrl + S`: save immediately in edit mode only.
- The handlers call `preventDefault()` only when the command is applicable.
- No note selected means no note-specific shortcut handling.
- Handlers are removed on unmount.
- Shortcut labels use `⌘E` on macOS and `Ctrl E` elsewhere where practical.
- `Escape` is not an edit-exit shortcut in the first version.

## 13. Layout and Visual Design

The right pane uses a stable lightweight header and one body area:

```text
┌─────────────────────────────────────────────┐
│ note/status                       编辑  ⌘E  │
├─────────────────────────────────────────────┤
│                                             │
│          rendered view or editor            │
│                                             │
└─────────────────────────────────────────────┘
```

The header:

- is approximately 36 px high;
- uses existing border and muted theme tokens;
- keeps the mode button visible with a ghost/low-contrast treatment;
- shows save state near the button only when useful;
- does not become a formatting toolbar.

Load failures render in the body with a read retry. Background save failures
render in a persistent strip below the header. The two error types are not
conflated.

## 14. Rendered Markdown Style

Register `@tailwindcss/typography` through the Tailwind 4 CSS plugin directive.

Use the following as a baseline, adjusted to existing theme variables:

```text
prose prose-zinc dark:prose-invert
```

Reading behavior:

- center the article in the body;
- limit text width to approximately `72ch`;
- provide responsive horizontal padding;
- let the pane, not the article, own vertical scrolling;
- avoid full-width prose on wide windows;
- map Typography colors to the application's foreground, muted, primary,
  border, and background tokens.

Element behavior:

- wrap tables in a horizontally scrollable container;
- keep GFM task checkboxes disabled;
- constrain images to the article width;
- provide horizontal scrolling for long code lines;
- use the existing monospace stack for inline and fenced code;
- retain language classes on fenced code blocks;
- do not load a syntax highlighter;
- do not render raw HTML;
- preserve safe URL transformation and reject dangerous protocols.

External links retain the desktop app's current navigation policy. This
refactor does not add a new opener dependency.

An empty note renders a small message such as:

```text
空白笔记 · 按 ⌘E 开始编辑
```

## 15. CodeMirror Configuration

Enable in the first version:

- Markdown language support;
- history and standard undo/redo;
- line numbers;
- active-line highlighting;
- bracket matching;
- standard search;
- standard keymaps;
- Tab indentation;
- autofocus after lazy mounting.

Do not enable:

- Vim mode;
- minimap;
- folding gutter;
- autocomplete;
- lint;
- a Markdown formatting toolbar;
- additional multi-cursor configuration.

The editor fills the body height and owns its vertical scrolling. It does not
auto-grow.

Theme colors map to existing app tokens. A light/dark change reconfigures a
CodeMirror theme compartment rather than destroying and recreating the
document.

For a file's active session:

- leaving edit mode records selection and editor scroll position;
- re-entering edit mode restores them;
- view scroll and editor scroll are stored separately;
- changing files discards those temporary values;
- no paragraph-level view/editor scroll mapping is attempted.

## 16. Status and Error Presentation

### Loading

- body-level spinner and `加载中…`;
- no old-file content under a new selection.

### Load error

- body-level message;
- retry read action;
- no editor mount.

### Saving

- compact neutral or warning-colored toolbar status;
- mode toggle disabled only when an edit-to-view transition awaits the save.

### Saved

- compact success status;
- fades after approximately 1–2 seconds;
- does not persist in view mode.

### Save error

- persistent error presentation with retry;
- edit-to-view failure remains in edit mode;
- in-memory content remains untouched;
- background old-file errors include the file name.

## 17. Dependency Changes

Add direct runtime dependencies:

- `react-markdown`;
- `remark-gfm`.

Add the Tailwind Typography package in the dependency category recommended for
the current build setup.

Remove after migration proves no remaining imports:

- `@milkdown/crepe`;
- Milkdown/ProseMirror packages present only for the old editor;
- Crepe-specific CSS variables and styles.

Do not add:

- Shiki;
- Prism;
- highlight.js;
- DOMPurify;
- `marked`;
- `markdown-it`;
- Monaco.

## 18. Testing Strategy

### 18.1 Document-session tests

Use Vitest fake timers and controllable promises to cover:

- initial successful read;
- failed read and retry;
- stale A read resolving after the user selects B;
- 400 ms debounce writing only the latest snapshot;
- captured saves retaining the old path;
- dirty old content being queued during a file change;
- an older successful save not marking newer content saved;
- empty-string saves;
- immediate manual flush;
- edit exit awaiting the newest save;
- failed exit save retaining dirty content and retry data;
- timer cleanup and absence of unhandled promise rejections.

Mock or inject read and write boundaries; tests do not start Tauri.

### 18.2 Viewer tests

Use Testing Library to verify semantic output for:

- headings, paragraphs, lists, links, and fenced code;
- GFM tables;
- checked and unchecked task items;
- disabled checkboxes;
- horizontally scrollable table wrapping;
- raw HTML not becoming executable DOM;
- dangerous URLs not becoming executable links;
- the empty-note state.

Do not snapshot the complete Typography-generated DOM or CSS.

### 18.3 Controller interaction tests

Mock the lazy CodeMirror component and cover:

- view mode by default;
- toolbar entry to edit mode;
- keyboard and button parity;
- save shortcut applying only in edit mode;
- lazy loading UI and duplicate-transition prevention;
- immediate clean exit;
- dirty exit awaiting flush;
- failed flush retaining edit mode and content;
- `filePath` changes restoring view mode;
- shortcut cleanup on unmount.

### 18.4 CodeMirror adapter tests

Because jsdom does not provide meaningful layout behavior, limit automated
adapter tests to:

- mount/unmount smoke coverage;
- initial value;
- document changes invoking `onChange`;
- `EditorView` destruction;
- theme updates preserving the document;
- initial/current-session selection restoration.

Validate IME, real scrolling, search UI, and keyboard feel manually.

### 18.5 Save queue regression

Retain existing queue tests and add:

- `pending(path)` waits for the latest write on that path;
- pending behavior remains correct after an earlier failure;
- empty strings are passed unchanged to the writer.

## 19. Verification

Required commands:

```bash
pnpm --filter bkmrx test
pnpm --filter bkmrx build
git diff --check
```

Inspect the production build to confirm:

- the initial rendered-view path contains no Milkdown/ProseMirror code;
- CodeMirror is emitted in an asynchronous chunk;
- no syntax-highlighting package is present;
- selected Markdown packages are direct dependencies.

Do not invent a fixed millisecond performance budget. Record actual behavior
for a short note, a representative note, and a long note.

## 20. Manual Acceptance

Use at least:

1. an empty note;
2. a representative note with headings, nested lists, a table, task items, and
   fenced code;
3. a long document with long code lines.

Check:

- light and dark contrast;
- approximately 72ch reading width;
- narrow-window behavior;
- table and code horizontal scrolling;
- repeated rapid `Cmd/Ctrl + E`;
- Chinese IME composition;
- rapid A/B selection while editing;
- failed-save recovery;
- clearing and saving an entire note;
- separate view/editor position restoration;
- autofocus after first lazy load;
- accessible name, focus state, and tooltip for the mode button.

## 21. Documentation Updates

After implementation:

- update `docs/ARCHITECTURE.md` to replace Milkdown/Crepe descriptions;
- document the rendered-view and lazy editor component split;
- update dependency and known-risk sections;
- remove obsolete suggestions to enable Crepe features.

## 22. Completion Criteria

The refactor is complete only when:

- every note opens in rendered view;
- the button and shortcut reliably enter and leave edit mode;
- supported Markdown renders correctly in both themes;
- view mode initializes neither Milkdown nor CodeMirror;
- stale reads cannot replace the active content;
- queued writes cannot target the wrong file;
- an empty note can be saved;
- save failures retain in-memory content and can be retried;
- Milkdown runtime code and dedicated CSS are removed;
- automated tests and build pass;
- manual acceptance passes;
- architecture documentation is current.
