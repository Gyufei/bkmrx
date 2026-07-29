# Markdown Refactor Retrospective and v1.0.0 Design

Date: 2026-07-29

## Purpose

Record the completed Markdown view/edit refactor as an engineering retrospective
and establish `1.0.0` as the transition from feature completion to stable
operation and maintenance.

This change documents existing behavior and synchronizes product-version
metadata. It does not change the database schema, dependency versions, note
file formats, Tauri command contracts, or the established Markdown
architecture.

## Retrospective document

Create `docs/markdown-view-edit-refactor-retrospective.md` as the durable record
of the refactor.

The document will cover:

1. the original WYSIWYG-oriented editor and the reading-first product goal;
2. the evaluated rendering and editing approaches and their trade-offs;
3. the final separation between `MarkdownViewer`, the lazy
   `MarkdownSourceEditor`, `NoteEditor`, `useNoteDocument`, and
   `NoteSaveQueue`;
4. the read, save, retry, unmount, and file-switch races found during
   implementation;
5. the invariants used to prevent stale reads, stale writes, lost drafts, and
   cross-file contamination;
6. the role of TDD, task-level reviews, final reviews, and isolated Tauri
   acceptance testing;
7. the removal of Milkdown/Crepe and the bundle boundary that keeps CodeMirror
   out of the default reading path;
8. the final long-link and long-source-line wrapping polish;
9. known non-blocking debt, including existing sourcemap and large-chunk build
   warnings;
10. the maintenance contract that begins with `1.0.0`.

The document is an engineering retrospective, not a chronological transcript.
It will emphasize decisions, rejected alternatives, failure modes, verified
outcomes, and reusable lessons.

## v1.0.0 maintenance contract

The retrospective will state that `1.0.0` means all currently planned product
capabilities are complete and the application is entering normal use and
maintenance.

After `1.0.0`:

- backward compatibility is the default;
- breaking changes require explicit justification, migration impact, and
  documented rollout;
- note storage, settings, command contracts, and user workflows must not change
  casually;
- bug fixes and behavior changes require regression tests;
- dependencies and architecture are changed for a concrete need, not novelty;
- migrations and deprecations must preserve recoverability and user data;
- releases prefer small, reviewable, reversible increments.

This is a stability policy, not a promise that the product will never evolve.

## Version synchronization

Set the application version to `1.0.0` in every active first-party version
source:

- `apps/desktop/package.json`;
- `apps/desktop/src-tauri/tauri.conf.json`;
- `apps/desktop/src-tauri/Cargo.toml`;
- the `bkmrx` package entry generated in
  `apps/desktop/src-tauri/Cargo.lock`.

`pnpm-lock.yaml` is modified only if pnpm represents the workspace package
version in its lock metadata. Dependency versions remain unchanged.

The runtime About information continues to derive the application version from
Cargo package metadata; no extra hard-coded UI version is introduced.

## Included final polish

The already implemented, uncommitted Markdown wrapping changes are included in
the `1.0.0` release scope:

- rendered Markdown links wrap inside the reading column;
- CodeMirror uses its official line-wrapping extension for visual wrapping;
- source Markdown content is not mutated by visual wrapping;
- fenced rendered code keeps horizontal overflow behavior.

These changes retain their focused regression tests.

## Verification

Before completion:

1. all active version sources report `1.0.0`;
2. frontend tests pass;
3. the frontend TypeScript and Vite production build passes;
4. Rust tests pass;
5. strict Clippy passes for all targets;
6. the Markdown wrapping regression tests pass;
7. dependency versions and database schema remain unchanged;
8. `git diff --check` passes;
9. generated build artifacts are removed after verification.

## Delivery

Keep the retrospective, wrapping polish, and version synchronization within one
reviewable release change. Do not include unrelated refactors or cleanup.
