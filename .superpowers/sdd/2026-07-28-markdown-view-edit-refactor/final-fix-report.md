# Markdown View/Edit Refactor — Final Fix Wave

Date: 2026-07-29
Branch: `codex/markdown-view-edit-refactor`
Code commit: `a4904086c25c2e38420b866383ab83fd56b46bcb`

## Scope and method

This wave addressed the two Critical findings, four Important findings, the
`react-markdown` native-prop Minor, and the small toolbar requirements explicitly
called out by the final review. Each behavior was reproduced with a focused test
before its production change, then rerun after the smallest corresponding fix.

Baseline before this wave:

- `pnpm --filter bkmrx test`
- 11 test files, 71 tests, all passing
- clean worktree at `2bae1fa`

## Critical 1 — unmount lost edits made inside the 400 ms debounce

### Root cause

The path effect cleanup cleared `saveTimerRef`, but called
`flushCurrentSnapshot` only when `renderedPathRef.current !== filePath`. That
condition is true for a committed path change and false for a real component
unmount, so the last unsubmitted version had no remaining submission path.

### RED

Added a StrictMode regression that edits, advances 399 ms, unmounts, advances
the final millisecond, and requires exactly one captured `/a.md + draft` write.

Command:

```bash
pnpm --filter bkmrx exec vitest run src/notes/use-note-document.test.tsx \
  -t 'submits the latest snapshot exactly once when unmounted before the debounce'
```

Observed failure:

```text
expected "spy" to be called 1 times, but got 0 times
```

### Fix

The cleanup now always calls `flushCurrentSnapshot` after cancelling the timer.
The existing current-version versus latest-submitted-version check remains the
idempotency guard, so StrictMode cleanup does not submit a version twice.

### GREEN

The focused StrictMode test passes. The complete hook/queue integration set also
passes.

### Commit

`a4904086c25c2e38420b866383ab83fd56b46bcb`

## Critical 2 — an old retry could become the final writer

### Root cause

Retry identity and supersession were keyed by `sessionId + path + version`.
Versions restart when a path is read again, and `retrySave()` resubmitted the
failed snapshot verbatim. `NoteSaveQueue` correctly preserves enqueue order, so
an old retry enqueued after a newer save was allowed to write last and roll the
file back. The per-session success watermark could not order attempts across
`A → B → A`.

### RED

Added two integrations using the real `NoteSaveQueue`:

1. Same session: `v1 failure → v2 pending → v1 retry`.
2. Cross session: `A old failure → B → A new save pending → old A retry`.

Command:

```bash
pnpm --filter bkmrx exec vitest run src/notes/use-note-document.test.tsx \
  -t 'does not let .* retry overwrite'
```

Observed failures:

```text
expected 'v1' to be 'v2'
expected 'old A draft' to be 'new A draft'
```

### Fix

- Added a monotonically increasing generation and latest-submission promise per
  absolute path.
- Every actual submission receives a new path generation.
- A failure whose generation is older than the path's latest submission is
  superseded and cannot enqueue its old content behind that newer write.
- Retrying a superseded failure waits for the path's latest submitted write.
- Retrying the latest failure for the active path submits the current in-memory
  path/content/session/version snapshot with a new generation.
- Retrying the latest failure for an inactive path retains the captured failed
  snapshot, but assigns its retry a new generation.
- A successful newer path generation retires an older displayed failure.

### GREEN

Both real-queue integrations pass and their final writer content remains `v2`
and `new A draft`, respectively.

### Commit

`a4904086c25c2e38420b866383ab83fd56b46bcb`

## Important 1 — `A → B → A` read did not wait for A's queued write

### Root cause

`NoteSaveQueue.pending(path)` existed and was covered by queue tests, but
`useNoteDocument` never called it. A revisit could therefore read the old disk
value while the captured old-A save was still queued.

### RED

Added a real-queue/in-memory-disk integration. While A's writer is blocked, the
second A read must not start; after the writer resolves, the read must return
the updated content.

Observed failure:

```text
expected "spy" to be called 2 times, but got 3 times
```

### Fix

- Added `pending(path)` to `NoteDocumentDependencies`.
- Production binds it directly to `sharedNoteSaveQueue.pending(path)`.
- `readCurrent` awaits the captured path's queue tail before calling the read
  API.
- It validates mounted state, path, and session both after the pending wait and
  after the read.
- Added a second regression proving that a session made stale during the
  pending wait never starts its stale read.

### GREEN

Both pending-read tests pass; A is read only after its writer updates the
in-memory disk, and the stale-after-wait read is never invoked.

### Commit

`a4904086c25c2e38420b866383ab83fd56b46bcb`

## Important 2 — edit-to-view flush could finish before a newer edit

### Root cause

`flush()` captured one version and awaited one `flushCurrentSnapshot` call. If
the user entered v2 while v1 was pending, the original flush resolved with v1
and left v2 on its debounce timer, allowing the controller to enter view mode
early.

### RED

Added a controllable two-write test: start flushing v1, edit to v2 while v1 is
pending, resolve v1, and require the original flush promise to remain pending
until v2 succeeds.

Observed failure:

```text
expected 2nd "spy" call to have been called with [ '/a.md', 'v2' ],
but called only 1 times
```

### Fix

`flush()` now captures its path/session and drains in a loop. After each
successful awaited snapshot, it rechecks the current version and submits the
newest snapshot if the version advanced. It exits immediately if the captured
path/session is no longer active.

### GREEN

The focused test proves v2 is submitted and the original flush promise does not
settle until v2 resolves.

### Commit

`a4904086c25c2e38420b866383ab83fd56b46bcb`

## Important 3 — in-flight rejection after unmount had no fallback

### Root cause

Save rejection callbacks always attempted UI state updates. Their outer callers
contained the promise rejection, so after unmount the failure was neither an
unhandled rejection nor visible UI, but it also produced no required console
fallback.

### RED

Changed the previous inverse assertion into the approved behavior: unmount with
one in-flight save, reject it, require no `unhandledrejection`, and require one
non-content diagnostic.

Observed failure:

```text
expected "error" to be called 1 times, but got 0 times
```

### Fix

- Added `mountedRef` lifecycle tracking.
- Async read/save completion paths no longer call React state setters after
  unmount.
- A save rejection after unmount is still contained, but reports exactly one
  `console.error` containing only `path`, `version`, and normalized `error`.
- The diagnostic deliberately omits note content.

### GREEN

The test observes no unhandled rejection, exactly one fallback call, the
expected path/version/error fields, and no `draft` content.

### Commit

`a4904086c25c2e38420b866383ab83fd56b46bcb`

## Important 4 — Markdown link policy and shell rejection handling

### Root cause

`react-markdown` converted dangerous link destinations to an empty href. The
handler returned before `preventDefault()` for that value, leaving default
navigation available. Conversely, every non-empty relative, anchor, IRC, or
XMPP link was sent to Tauri shell open even though `shell:allow-open` accepts
only HTTP(S), mailto, and tel. The returned shell Promise was not observed.

### RED

Expanded viewer tests to click:

- a dangerous URL transformed to empty href;
- relative, anchor, IRC, and XMPP destinations;
- HTTP, HTTPS, mailto, and tel destinations;
- an allowed URL whose shell open rejects.

The initial run had five failures, including:

```text
expected false to be true
expected "spy" to not be called at all, but actually been called 4 times
expected "error" to be called ... Number of calls: 0
```

### Fix

- Defined one explicit intersection policy: only valid absolute
  `http://`, `https://`, `mailto:`, and `tel:` destinations are actionable.
- Added a `react-markdown` URL transform for link hrefs, while retaining the
  library's default transform for other URL-bearing elements such as images.
- All rendered anchor clicks call `preventDefault()` first.
- Inert destinations have no href and are never sent to the shell.
- Allowed destinations call the shell and catch/report a normalized rejection.

### GREEN

All nine MarkdownViewer tests pass. Allowed schemes reach the shell exactly;
dangerous, relative, anchor, IRC, and XMPP clicks are inert; shell rejection is
contained and reported once.

### Commit

`a4904086c25c2e38420b866383ab83fd56b46bcb`

## Minor — `react-markdown` node prop reached native elements

### Root cause

The custom table and link renderers spread all renderer props onto native
elements. `react-markdown` supplies an AST `node` prop, which became
`node="[object Object]"` in the DOM.

### RED

The new native-element regression observed the unwanted attribute on both the
anchor and table.

### Fix

Both renderers explicitly destructure and discard `node` using
`react-markdown`'s `ExtraProps` type before spreading native props.

### GREEN

Neither native element has a `node` attribute.

### Commit

`a4904086c25c2e38420b866383ab83fd56b46bcb`

## Small approved toolbar completion

The design precisely required a visible platform shortcut hint and useful
transient save status, so these were included without expanding the controller
contract:

- macOS renders `编辑/查看 ⌘E`; other platforms render `编辑/查看 Ctrl E`;
- edit mode renders `保存中...` while saving;
- a transition to saved renders `已保存` for 1.5 seconds;
- saved status is not retained in view mode.

RED initially showed the bare `编辑` label and no `role="status"` elements.
All 25 controller tests pass after the minimal toolbar change.

Commit: `a4904086c25c2e38420b866383ab83fd56b46bcb`

## Preserved constraints

- Autosave delay remains exactly 400 ms.
- Empty-string content remains a valid save payload.
- Every submitted save still captures path, content, session, and version;
  generation is additional ordering metadata.
- Production reads/writes still use absolute paths and the existing
  `readNoteContentApi` / `sharedNoteSaveQueue` / Rust command boundaries.
- View mode does not import or initialize CodeMirror; the source editor remains
  a lazy chunk.
- `NotesPanel` and the `NoteEditor({ filePath })` public prop contract are
  unchanged.
- No parser, state-machine, context, global notification, Rust command, or
  dependency was added.

## Verification

Targeted:

```text
pnpm --filter bkmrx exec vitest run src/notes
6 files passed, 72 tests passed
```

Complete pre-commit gate:

```text
pnpm --filter bkmrx test
11 files passed, 82 tests passed

pnpm --filter bkmrx build
TypeScript and Vite build exited 0

git diff --check
no output
```

The build continues to print the repository's existing sourcemap-location and
large-chunk warnings. It still emits `MarkdownSourceEditor` as an asynchronous
chunk; this wave did not change the lazy boundary.

## Deferred/non-blocking items

The ledger's previously deferred CodeMirror snapshot-depth, media-listener
cleanup, and broader controller load-error/lazy-factory test minors remain
outside this final core fix wave. No unrelated code was changed.
