# Document Session state-machine refactor

## Goal

Move load, receipt, autosave, retry, rename, delete, and retirement coordination out of
`useNoteDocument` into one concrete, single-document `DocumentSession` module. Keep the React hook
as a lifecycle and subscription adapter.

## Invariants

- One `DocumentSession` owns exactly one Settings Revision and relative note identity.
- At most one save request is in flight.
- Edits made during a save coalesce into one follow-up save containing the latest draft.
- Every save uses the receipt returned by the previous successful document operation.
- Failed saves keep the latest draft dirty and retryable.
- Successful rename and delete retire the session; disposal cannot save the old identity.
- Failed rename and delete resume autosave for a dirty draft.

## Test seams

- State-machine behavior is tested through the concrete `DocumentSession` interface.
- React integration is tested through `useNoteDocument` and its returned `NoteDocumentSession`.
- `NoteEditor` and `NotesPanel` behavior tests remain unchanged except for removing legacy I/O
  injection that bypasses receipts.

## Steps

1. Add the concrete session with immutable snapshots, subscription, open, edit, and save-loop tests.
2. Add retry and terminal-operation behavior, including disposal and failure recovery.
3. Replace the hook implementation with a thin `useSyncExternalStore` adapter.
4. Remove per-path watermarks, generations, the legacy `read/save/pending` hook seam, and tests of
   those implementation details.
5. Run TypeScript, all Notes tests, Clippy, Rust Notes tests, and a final diff review.

## Impact

- Direct: `document-session.ts`, `use-note-document.ts`, and their tests.
- Compatibility: `NoteEditor` and `NotesPanel` keep the existing `NoteDocumentSession` interface.
- No backend command, receipt, filesystem, or database changes are required.
