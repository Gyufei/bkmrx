# Notes and Settings Refactor Design

## Goal

Bring Notes and Settings into alignment with the architectural boundaries established by the
bookmarks refactor, without copying abstractions that their smaller domains do not need.

This refactor must address:

- Notes module responsibility boundaries and watcher lifecycle.
- Ordered note saves so stale writes cannot overwrite newer content.
- Settings updates that preserve all currently edited fields.
- Atomic settings persistence.
- A shared application error contract.
- Missing regression tests for the changed behavior.

## Explicitly Deferred

The following known issues are out of scope for this refactor:

- Preserving Markdown frontmatter when NoteEditor writes edited content.
- Restricting Notes commands to paths beneath the configured notes directory.

The existing absolute-path command contract and current frontmatter behavior must remain unchanged.

## Architecture

### Shared errors

Move `AppError` and `AppResult` from the bookmarks domain into `src-tauri/src/error.rs`.
Bookmarks, Notes, Settings, Tauri commands, and the HTTP adapter will use this shared contract.

The error representation remains wire-compatible:

```rust
pub struct AppError {
    pub code: String,
    pub message: String,
    pub details: Option<serde_json::Value>,
}

pub type AppResult<T> = Result<T, AppError>;
```

Existing bookmark error codes and HTTP mappings must not change. Add general file/settings error
constructors only where the new Notes and Settings implementations require stable codes.

### Notes backend

Replace the single `notes.rs` file with a flat `notes/` module:

- `model.rs` owns `NoteFile`.
- `repository.rs` owns recursive scanning and file create/read/write/delete/rename operations.
- `service.rs` exposes the Notes use cases consumed by Tauri commands and maps repository failures
  to `AppError`.
- `watcher.rs` owns watcher creation, replacement, shutdown, and conversion from filesystem events
  to application note events.
- `mod.rs` re-exports the public Notes API.

`NoteService` is a concrete service rather than a generic trait-based abstraction. The repository
uses real temporary directories in tests, so an interface solely for mocking is unnecessary.

The application owns one shared `NoteService` in Tauri managed state. Commands call only this
service. A successful scan updates the watched directory through the service. Watcher startup
errors propagate as structured errors rather than being printed and ignored.

This refactor does not canonicalize or constrain paths. Commands continue accepting the same
absolute string paths they accept today.

### Settings backend

Replace the single `settings.rs` file with a flat `settings/` module:

- `model.rs` owns `Settings` and `SystemInfo`.
- `store.rs` owns JSON load/save.
- `runtime.rs` owns `RuntimePaths`.
- `mod.rs` re-exports the public Settings API.

Settings storage stays concrete; no generic repository trait is introduced.

Saving uses an atomic replacement in the destination directory:

1. Serialize the complete settings value.
2. Create a uniquely named temporary file next to `settings.json`.
3. Write and flush the temporary file.
4. Rename it over `settings.json`.
5. Remove the temporary file when an error occurs before replacement.

Missing settings still return `Settings::default()` without creating a file. Invalid JSON returns
a structured settings error and is not silently replaced.

### Frontend save ordering

Add a small Notes save queue utility with one ordered promise chain per file path.

Every NoteEditor write path uses the same queue:

- debounced editor updates;
- Cmd+S / Ctrl+S;
- pending-save flush during file switches or unmount.

For one file, write N must settle before write N+1 begins. A failed write is reported to the caller
but does not permanently block later queued writes. Different files may save independently.

This queue preserves current content behavior, including the explicitly deferred frontmatter
handling.

### Frontend settings updates

Both SettingsPage save buttons submit one complete snapshot built from the current `backupDir` and
`notesDir` component state. Neither update is based on a potentially stale React Query settings
object.

The current two-button UI remains unchanged. A successful update continues invalidating the
settings query.

## Data Flow

### Notes

```text
NoteEditor / NotesPanel
  -> notes.api.ts
  -> invoke.ts
  -> Tauri command
  -> NoteService
  -> NoteRepository or NoteWatcher
  -> filesystem / Tauri event
```

### Settings

```text
SettingsPage
  -> settings.api.ts
  -> invoke.ts
  -> Tauri command
  -> SettingsStore using RuntimePaths.settings_path()
  -> atomic settings.json replacement
```

Bookmark import/export remains routed through `BookmarkService`, even though its controls are
rendered on SettingsPage.

## Error Handling

- Notes and Settings return `AppResult`, never raw `String`.
- Filesystem failures receive stable domain-neutral or domain-specific error codes.
- Existing bookmark error codes and response shapes remain unchanged.
- Watcher initialization failures reach the Notes query caller.
- Autosave failures remain visible in NoteEditor and later saves may still proceed.
- Settings parse failures remain explicit; the app does not overwrite corrupt settings
  automatically.

## Testing

### Rust

Add Notes tests using `tempfile::TempDir` for:

- recursive Markdown scanning and deterministic ordering;
- create/read/write/rename/delete behavior through `NoteService`;
- structured error mapping;
- watcher startup failure propagation where it can be exercised deterministically.

Extend Settings tests for:

- atomic round trip;
- no leftover temporary file after success;
- invalid JSON returning the stable settings error;
- a failed replacement preserving the previous settings file where the platform permits a
  deterministic test.

Existing bookmarks repository, search, transfer, command, and HTTP tests must remain green.

### TypeScript

Add tests for:

- same-file saves executing in enqueue order;
- a failed save not blocking the next save;
- different-file queues remaining independent;
- SettingsPage submitting both current input values from either save button.

Existing bookmark tests must remain green.

## Success Criteria

- Tauri Notes commands call a managed `NoteService` rather than free filesystem functions.
- Notes scanning, file operations, watcher lifecycle, and models reside in focused modules.
- Settings models, runtime paths, and persistence reside in focused modules.
- Notes and Settings use the shared `AppError`/`AppResult` contract.
- Settings writes use atomic replacement.
- Note writes for the same file cannot complete out of enqueue order.
- Either Settings save button preserves both currently edited fields.
- The two deferred issues remain behaviorally unchanged.
- `cargo test --manifest-path src-tauri/Cargo.toml`, `npm test -- --run`, and `npm run build`
  complete successfully.
