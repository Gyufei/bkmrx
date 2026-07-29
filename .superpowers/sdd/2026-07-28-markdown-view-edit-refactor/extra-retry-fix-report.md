# Markdown View/Edit Refactor — Extra Retry Fix

Date: 2026-07-29
Branch: `codex/markdown-view-edit-refactor`
Base commit: `1f16275ea2f6b8e3edb4c915c120f5374b408731`
Code commit: `278da5c091e3256279aba1694e018c89de9bf499`

## Scope

This extra wave addressed only the final review's two residual findings:

1. retrying a captured failed A draft after `A → B → A` could save the
   re-read disk value and discard the only failed draft;
2. per-path save generation watermarks were retained for the hook lifetime.

No public hook, editor, queue, Rust command, dependency, or debounce contract
was changed.

## Critical — retry after an unedited same-path reopen

### Root cause

`retrySave()` treated `currentPathRef.current === failure.path` as sufficient
evidence that `contentRef.current` superseded the captured failure. After
`A → B → A`, `readCurrent()` starts a new session, resets its version, and
loads the old disk value into `contentRef`. Retrying before any real edit
therefore submitted that old disk value with a newer path generation. Its
success callback then cleared the retained failure, permanently losing the
captured draft.

### RED

Added a real `NoteSaveQueue` integration:

```text
A disk value → failed A draft write → B → A disk re-read → retry without edit
```

The retry writer was blocked so the test could also assert that the failed
copy remained retained until the correct retry succeeded.

Command:

```bash
pnpm --filter bkmrx exec vitest run src/notes/use-note-document.test.tsx \
  -t 'retries the captured failed draft after reopening the same path without editing'
```

Observed failure:

```text
expected 'A on disk' to be 'failed A draft'
```

### GREEN

The hook now records whether the current read session has received a real
`setContent()` edit. Retry selection is:

- wait for the latest submitted promise when a newer path generation already
  supersedes the failure;
- submit current content for the original failure session or a genuinely
  edited current session;
- otherwise resubmit the captured failure path/content/session/version.

The real queue integration now proves that the final writer receives
`failed A draft`, the retained failure remains visible while that writer is
blocked, and the failure clears only after the captured draft reaches disk.

## Important — bounded path generation watermarks

### Root cause

`pathSaveWatermarksRef` had no quiescence accounting or release trigger.
Every distinct path that submitted a save therefore retained its generation
and latest Promise until hook unmount. A safe deletion point could not be
inferred from one Promise alone because older submissions, retained failures,
active retries, and pending reads can still depend on the same ordering epoch.

### RED

Because retained map size has no stable public UI output, the test uses a
narrow test-only `Map.set` probe for dedicated absolute paths. No diagnostic
interface was added to production.

The behavioral sequence covers:

```text
successful settle
→ same-path pending read
→ retained failure
→ failure dismissal
→ failed revisit save
→ active retry
→ retry success
```

Initial RED:

```text
expected true to be false
```

The settled path still existed in the watermark map.

Two additional release transitions were verified with their own RED:

- dismissing the retained failure initially left the path entry present;
- replacing retained failure A with failure B initially left settled A
  present.

Both failed with the same `expected true to be false` observation before
their release triggers were added.

### Reclamation invariants

A path watermark may be removed only when all of these are true:

1. `unsettledSubmissions === 0`;
2. `pendingReads === 0`;
3. `saveFailureRef` does not retain that path;
4. `retryPromiseRef` does not retain an active retry for that path;
5. the map still points to the exact watermark object being released.

Every actual save submission increments both its per-path generation and its
unsettled count. Both fulfillment and rejection decrement that count exactly
once. Reads retain the watermark through their pending-write wait and disk
read, then release it in `finally`.

Release checks run after:

- submission settlement;
- read settlement;
- retry settlement;
- failure dismissal;
- replacement of a retained failure by a failure on another path.

The object-identity guard prevents an old asynchronous completion from
deleting a later watermark epoch recreated for the same path. Generation may
restart only after the prior epoch is fully quiescent, so no old callback,
failure, retry, or pending read remains to compare against the new epoch.
This preserves cross-session monotonicity and the existing C2 ordering
contract while bounding storage to paths with live dependencies.

### GREEN

The test observes each eligible deletion, proves that entries remain present
during pending reads, retained failures, and active retries, and then revisits
the reclaimed path through a failed save and successful retry. The final disk
writer remains the latest failed draft.

## Verification

Targeted hook and real queue integration:

```text
pnpm --filter bkmrx exec vitest run \
  src/notes/use-note-document.test.tsx \
  src/notes/note-save-queue.test.ts

2 files passed
33 tests passed
```

Complete test suite:

```text
pnpm --filter bkmrx test

11 files passed
85 tests passed
```

Production build:

```text
pnpm --filter bkmrx build

TypeScript and Vite exited 0
2415 modules transformed
```

Formatting and diff:

```text
pnpm --filter bkmrx exec prettier --check \
  src/notes/use-note-document.ts \
  src/notes/use-note-document.test.tsx

All matched files use Prettier code style

git diff --check
no output
```

An independent read-only review of the final code diff reported no Critical,
Important, or Minor findings and assessed it ready.

## Known non-blocking output

The production build still prints the repository's existing sourcemap-location
messages for `dialog.tsx` and `context-menu.tsx`, plus the existing large-chunk
warning. The build exits successfully, and this wave did not change those
files or the lazy editor boundary.
