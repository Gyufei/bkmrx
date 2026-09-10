# Atomic note writes in Rust

Date: 2026-09-07

## Decision

Use [`atomic-write-file`](https://docs.rs/atomic-write-file/latest/atomic_write_file/) for the Notes Workspace write implementation. Keep SHA-256 for document revision fingerprints because the application already depends on `sha2`. Do not add a filesystem abstraction or a session registry.

## Why

- `atomic-write-file` writes a temporary sibling, synchronizes its contents, and replaces the destination at commit. It supports Unix, Windows, and WASI, and its Unix implementation uses directory-relative operations to avoid cross-device writes and directory-rename races. ([crate documentation](https://docs.rs/atomic-write-file/latest/atomic_write_file/#how-it-works))
- Its interface resembles `std::fs::File`, so the Notes Workspace can keep atomic-write details inside its existing implementation rather than adding another public seam. ([AtomicWriteFile](https://docs.rs/atomic-write-file/latest/atomic_write_file/struct.AtomicWriteFile.html))
- `tempfile::TempPath::persist` atomically replaces an existing destination, but it is a lower-level primitive: the application would still own writing, synchronization policy, and several failure stages. ([TempPath::persist](https://docs.rs/tempfile/latest/tempfile/struct.TempPath.html#method.persist))
- `atomicwrites` also supports POSIX and Windows and offers explicit overwrite behavior, but its interface provides less control for narrowing the optimistic-concurrency check immediately before commit. ([atomicwrites documentation](https://docs.rs/atomicwrites/latest/atomicwrites/))
- `atomwrite` includes hashing, optimistic locking, backups, WAL, searching, AST operations, and a CLI-oriented NDJSON surface. That is substantially broader than the local dependency needed by Notes Workspace. ([atomwrite documentation](https://docs.rs/atomwrite/latest/atomwrite/))

## Limits that remain ours

- Atomic replacement prevents readers from observing a partially written note; it does not provide a compare-and-swap operation against an external editor. Notes Workspace must compare the receipt fingerprint again immediately before commit, while accepting a very small unavoidable race with non-cooperating external processes.
- Replacement may lose timestamps, ACLs, extended attributes, SELinux contexts, and some platform-specific ownership or permission metadata. The crate documents these limits explicitly. ([notes and limitations](https://docs.rs/atomic-write-file/latest/atomic_write_file/#notes-and-limitations))
- A crash can leave a temporary file behind, although the destination remains old-or-new rather than partially written. The optional unnamed-tempfile feature is Linux-only and is not appropriate for a cross-platform desktop default. ([unnamed temporary files](https://docs.rs/atomic-write-file/latest/atomic_write_file/#unnamed-tmpfile-linux-only))
- The documented Unix sequence synchronizes the temporary file before rename, but does not promise a parent-directory sync after rename. The product should describe this as atomic replacement, not guaranteed survival of every possible power-loss scenario.

## Proposed Notes Workspace interface

```text
open_document(workspace_revision, relative_path)
  -> { content, receipt }

save_document(receipt, content)
  -> { receipt }

rename_document(receipt, new_name, pending_content?)
  -> { relative_path, receipt }

delete_document(receipt)
  -> void
```

The receipt is an opaque encoding of the workspace revision, relative identity, and SHA-256 content fingerprint. It carries no authority by itself: every operation still performs the existing workspace path authorization.
