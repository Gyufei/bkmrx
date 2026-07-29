# Task 6 Report — Milkdown Cleanup, Documentation, and Verification

## Changes

- Removed `@milkdown/crepe` and its now-unreferenced transitive graph from
  `apps/desktop/package.json` and `pnpm-lock.yaml`.
- Deleted the obsolete `src/notes/config.ts` Crepe configuration.
- Removed the Milkdown/Crepe theme, ProseMirror, and generated CodeMirror gutter
  selectors from `App.css`, preserving viewer and scoped source-editor styles.
- Updated `docs/ARCHITECTURE.md` for the view-first Markdown viewer, lazy
  CodeMirror source editor, `Cmd/Ctrl + E`, 400 ms versioned autosave, and
  per-path save queue. Removed stale Milkdown toolbar, dependency, and callback
  risk references.

## Verification (raw summary)

- `pnpm --filter bkmrx test` exited 0: 10 test files passed, 68 tests passed.
- `pnpm --filter bkmrx build` exited 0: TypeScript and Vite completed; output
  includes `dist/assets/MarkdownSourceEditor-CGHI72WV.js` as the lazy source
  editor chunk.
- `git diff --check` exited 0 with no output.
- `rg -n "@milkdown|Milkdown|Crepe|ProseMirror" apps/desktop/src apps/desktop/package.json pnpm-lock.yaml`
  returned no matches.
- `react-markdown`, `remark-gfm`, and `@tailwindcss/typography` remain direct
  package entries. The forbidden-highlighter search returned no matches.

## Self-review

- Reviewed the staged diff: changes are limited to the requested dependency,
  obsolete config, old CSS, lockfile, and architecture documentation.
- The independent `ocr` review could not run because its configured LLM endpoint
  could not resolve in this environment (`dashscope.aliyuncs.com` DNS failure).
- No self-review findings requiring a code change.

## Commit

- `e75cf01 refactor: remove milkdown note editor`

## Concerns

- The installed `com.bkmrx` application opened its existing production note UI,
  not a build of this worktree, so it cannot validate this branch's visual/manual
  acceptance. I did not edit user notes in that application. The specified
  interactive acceptance cases (including IME and real save-failure simulation)
  still require a controlled local Tauri run with disposable notes.
- Vite reports pre-existing sourcemap-location warnings for `dialog.tsx` and
  `context-menu.tsx`, plus chunk-size warnings; the build still exits 0.

## Fix Round 1 — Documentation and Manual Acceptance

- Corrected the frontend source tree to match the actual `bookmarks/`,
  `components/`, `notes/`, `settings/`, and `lib/` directories. The Notes
  entries now include `NotesPanel`, `FolderTree`, `buildFolderTree`,
  `NoteEditor`, `MarkdownViewer`, `MarkdownSourceEditor`, `use-note-document`,
  the live `note-save` wrapper, and `note-save-queue`.
- Built an isolated `bkmrx Task 6.app` from this worktree with bundle identifier
  `com.bkmrx.task6`; its app data was separate from `com.bkmrx`, and its Notes
  setting pointed only at `/private/tmp/bkmrx-task6-notes.PESz2T`.
- Passed manually: empty/rich/long notes initially open rendered; headings,
  nested lists, GFM table, fenced code, and disabled tasks render; prose is
  centered at roughly 72ch; long code exposes horizontal scrolling; the
  edit/view control and `Cmd+E` work; three simultaneous `Cmd+E` events settle
  to one stable view; `Cmd+S` saves without leaving edit mode; clearing a file
  writes a zero-byte file; a temporary `chmod 400` save failure retains editor
  content and exposes retry, and retry succeeds after restoring permissions;
  rapid rich/long switching writes `A content belongs only to rich.md` and
  `B content belongs only to long.md` to their respective files.
- Blocked manual gate: after selecting the macOS **Dark** appearance, the
  isolated bundle remained visibly light. `App.css` defines dark values only
  below `.dark`; no current-theme bridge applies that class from the system
  preference. This prevents completing the required dark-theme acceptance.
- Not reached after the dark-theme failure: controlled verification of narrow
  panes, actual Chinese IME composition events, and visual restoration of
  editor selection/view scroll. The source and automated tests cover the
  corresponding controller paths, but they do not satisfy this manual gate.

### Dark-theme systematic debugging

**Phase 1 — stable reproduction and data flow**

- With the isolated `bkmrx Task 6.app` open, switched macOS Appearance from
  Light to Dark. The native System Settings window changed immediately, while
  the Tauri webview stayed light.
- Quit and relaunched the isolated bundle while macOS remained Dark; the webview
  again opened light. This makes the failure deterministic both for a live
  appearance change and dark-at-startup.
- Traced the theme input from the system preference. The source editor already
  reads `window.matchMedia('(prefers-color-scheme: dark)')`, initializes its
  CodeMirror theme from `media.matches`, and listens for `change`. At the app
  root, `main.tsx` renders `App` and imports `App.css`, but neither `main.tsx`
  nor `App.tsx` reads or subscribes to the system preference.
- Traced the failing output boundary. `App.css` defines the dark token set,
  scrollbar colors, viewer colors, and Tailwind dark variant only under a
  `.dark` ancestor. No production code applies that class to the document.

**Phase 2 — working-pattern comparison**

- The existing `MarkdownSourceEditor` is the in-project working pattern for
  system-theme propagation: read the same media query on startup, subscribe to
  its `change` event, apply the current result, and remove the listener during
  cleanup.
- The broken app-root path has the CSS consumer but omits all four propagation
  steps. The old Milkdown CSS used the same `.dark` ancestor convention, so the
  cleanup commit did not remove an existing root bridge; it exposed a
  pre-existing application-level omission during this refactor's manual gate.

**Phase 3 — single root-cause hypothesis**

The deterministic cause is the missing app-root system-theme bridge:
`prefers-color-scheme` reaches the webview and the source-editor listener, but
is never mirrored to the root `.dark` class required by every application
dark-theme selector. A root effect using the established media-query pattern
should make both dark-at-startup and live appearance changes select the existing
dark tokens without changing component CSS.

### Editor-scroll systematic debugging

**Phase 1 — stable reproduction and data flow**

- After the theme fix, scrolled the real CodeMirror editor to its bottom,
  switched to view, and switched back to edit. Repeated twice: the editor
  reopened at the top both times.
- The selection snapshot did survive. A selected terminal `测试` was not
  visibly in the reset viewport, but typing `x` after the round trip replaced
  exactly that selection; Undo restored `测试`. This isolates selection state
  from scroll state rather than treating the whole snapshot as lost.
- The existing unit boundaries prove that cleanup reads
  `view.scrollDOM.scrollTop`, `NoteEditor` carries the returned snapshot across
  the mode change, and the snapshot is passed back as `initialSnapshot`.
  The remaining write boundary is the immediate
  `view.scrollDOM.scrollTop = initialSnapshot.scrollTop` performed directly
  after `new EditorView(...)`.

**Phase 2 — working-pattern comparison**

- `MarkdownViewer` restores its existing DOM scroller in a React layout effect,
  after that scroller has been committed.
- CodeMirror's official reference provides `EditorView.requestMeasure` for
  synchronized DOM measure/write work. Its documented initialization API also
  treats scroll restoration as layout-sensitive (`scrollTo` /
  `scrollSnapshot`), unlike the current immediate raw DOM assignment.

**Phase 3 — single root-cause hypothesis**

The editor scroll snapshot is captured and routed correctly, but the restored
`scrollTop` is written before WebKit/CodeMirror has completed the newly
constructed editor's layout, so the write is clamped to zero. Scheduling only
that existing value assignment in CodeMirror's layout write phase should
preserve scroll without changing the established snapshot interface.

**Failed hypothesis and corrected root cause**

- The first minimal attempt moved restoration into
  `EditorView.requestMeasure`. Its unit regression passed, but a rebuilt real
  WebKit app still reopened at the top, so that change was discarded rather
  than layered with another timing patch.
- Temporary visible diagnostics then recorded the cleanup boundary. After both
  an outer-container scroll and a direct AX scroll of the editor entry area,
  the visible editor was near the bottom but passive cleanup read
  `view.scrollDOM.scrollTop === 0`. At that same cleanup point, a scan of the
  still-queryable document found no element with a nonzero `scrollTop`.
- This shows capture, not restore, is the broken boundary. The CodeMirror
  lifecycle is owned by a React passive effect; its cleanup runs after React
  has removed the editor DOM. WebKit resets the detached scroller to zero
  before the snapshot reads it. Selection still survives because it is read
  from CodeMirror's in-memory `EditorState`.
- Revised single root-cause hypothesis: running the editor lifecycle cleanup as
  a layout-effect cleanup will read selection and scroll while the DOM is still
  attached, preserving the current snapshot interface and allowing the
  existing immediate restoration to work.

### Fix implementation and regression evidence

- Added an app-root media-query effect that mirrors
  `prefers-color-scheme: dark` to `document.documentElement.dark`, applies the
  initial value, follows live changes, and removes its listener on cleanup.
- Theme TDD RED: the new app behavior test expected the root `.dark` class after
  a simulated system change and failed (`false` versus `true`) before the
  implementation. GREEN: the complete suite passed after the root effect.
- Changed the CodeMirror lifecycle from a passive effect to a layout effect so
  its existing snapshot callback reads the attached scroller before React
  removes it.
- Scroll TDD RED: the editor harness now appends a real scroll element and
  models WebKit's detached-scroll reset. With passive cleanup the existing
  snapshot test received `scrollTop: 0` instead of `96`. GREEN: with layout
  cleanup, all 7 source-editor tests and the complete suite pass.
- No new snapshot interface, restoration API, or editor controller state was
  introduced.

### Completed manual acceptance

The final isolated bundle was rebuilt from this worktree and rechecked with
only the disposable notes directory.

- Dark startup and live Dark → Light → Dark changes all update the app and
  CodeMirror immediately; rich rendered Markdown remains readable in dark
  mode.
- At a narrow window width, rendered prose retains horizontal padding and the
  long fenced-code block scrolls horizontally.
- Actual macOS Chinese IME composition was exercised in CodeMirror: the
  underlined `ce shi` composition committed as `测试`, and `Cmd+S` persisted it
  without leaving edit mode.
- The long rendered note returned to `VIEW_SCROLL_RESTORE_ANCHOR` after an
  edit/view round trip.
- The long CodeMirror note returned to lines 34–66 after a view/edit round trip,
  and the terminal selection `部。\n` remained selected.
- Together with the earlier controlled checks, every Step 7 case passed:
  empty/rich/long rendered files, readable light/dark themes, approximately
  72ch prose, narrow padding, table/code overflow, disabled task boxes,
  accessible edit/view control, rapid toggle stability, real IME, save without
  mode exit, empty save, failure/retry, A/B isolation, both scroll modes,
  selection restoration, and first-edit lazy load/focus/usability.

### Final automated verification

- `pnpm --filter bkmrx test` exited 0: 11 test files and 69 tests passed.
- `pnpm --filter bkmrx build` exited 0; the lazy editor output is
  `dist/assets/MarkdownSourceEditor-DuDNZukH.js`.
- `git diff --check` exited 0 with no output.
- The final Milkdown/Crepe/ProseMirror search and the forbidden-highlighter
  search returned no matches.
- `react-markdown`, `remark-gfm`, and `@tailwindcss/typography` remain direct
  dependencies.
- Vite still reports the pre-existing sourcemap-location and chunk-size
  warnings recorded above; they do not fail the build.

### Disposable acceptance resources

- Notes: `/private/tmp/bkmrx-task6-notes.PESz2T`
- Isolated app data:
  `/Users/gyf/Library/Application Support/com.bkmrx.task6`
- Isolated bundle:
  `/Users/gyf/MyLib/bkmrx-app/.worktrees/markdown-view-edit-refactor/apps/desktop/src-tauri/target/release/bundle/macos/bkmrx Task 6.app`

## Fix Round 2 — Architecture Scope and Theme Lifecycle Tests

- Clarified that the frontend source tree presents representative modules
  rather than a complete `src/` inventory, without expanding it with every
  API, test, or UI file.
- Corrected the root responsibilities: `App.tsx` composes the query provider
  and system-theme bridge, while `Layout.tsx` owns bookmark, notes, and settings
  routing.
- Added a startup regression that renders with
  `matchMedia.matches === true` and observes the root `.dark` class.
- Added an unmount regression that verifies the registered system-theme
  listener is removed with the same callback.
- RED mutation check: temporarily removed the initial `updateTheme()` and
  cleanup return from `App.tsx`. The targeted run failed exactly the two new
  tests while the existing live-change test remained green (1 passed,
  2 failed).
- GREEN: restored the production bridge unchanged; the targeted App suite
  passed all 3 tests.
- Final verification: `pnpm --filter bkmrx test` passed 11 files and 71 tests;
  `pnpm --filter bkmrx build` exited 0; `git diff --check` produced no output.
  The same pre-existing sourcemap-location and chunk-size warnings remain
  non-failing.
