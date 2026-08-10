# Consolidate Desktop Docs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Merge `apps/desktop/docs` into the repository-level `docs` tree without losing files or leaving broken active links.

**Architecture:** Preserve the existing `migration` and `superpowers` subtrees while moving them beneath the root documentation directory. Update only active references whose meaning changes after the move; retain historical commands whose paths were relative to the desktop project.

**Tech Stack:** Markdown, Git, pnpm monorepo layout

## Global Constraints

- Preserve every tracked document.
- Do not rewrite historical desktop-relative commands.
- Remove `apps/desktop/docs` after all files move.

---

### Task 1: Merge the documentation trees

**Files:**
- Move: `apps/desktop/docs/migration/*` → `docs/migration/*`
- Move: `apps/desktop/docs/superpowers/plans/*` → `docs/superpowers/plans/*`
- Move: `apps/desktop/docs/superpowers/specs/*` → `docs/superpowers/specs/*`

- [ ] **Step 1: Confirm destinations have no same-name files**

Run: `comm -12 <(find apps/desktop/docs -type f -print | sed 's#^apps/desktop/docs/##' | sort) <(find docs -type f -print | sed 's#^docs/##' | sort)`

Expected: no output.

- [ ] **Step 2: Move each tracked subtree with Git**

Run: `git mv apps/desktop/docs/migration docs/migration`, then move the plan and spec files into the existing root `docs/superpowers` directories.

Expected: `apps/desktop/docs` no longer exists and Git reports renames.

### Task 2: Repair active documentation links

**Files:**
- Modify: `apps/desktop/README.md`
- Modify: `docs/superpowers/plans/2026-07-24-bkmrx-monorepo-migration.md`

- [ ] **Step 1: Point the desktop README at root documentation**

Change the migration links from `docs/migration/...` to `../../docs/migration/...`.

- [ ] **Step 2: Correct the monorepo plan's current-location statement**

Replace the obsolete `apps/desktop/docs/` location with `docs/`.

- [ ] **Step 3: Verify the result**

Run: `test ! -d apps/desktop/docs`, search for obsolete `apps/desktop/docs` references, and inspect `git diff --check`.

Expected: the old directory is absent, no active obsolete location remains, and `git diff --check` exits successfully.
