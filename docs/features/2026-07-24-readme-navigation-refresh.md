# README Navigation Refresh Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rewrite the repository and application READMEs in Chinese with clear ownership, concise onboarding, and bidirectional navigation.

**Architecture:** The root README owns product and repository-level context. Each child README remains independently useful for its application while linking to the root, sibling application, and relevant shared documentation.

**Tech Stack:** Markdown, pnpm workspace, Tauri, React, Rust, Chrome Manifest V3

## Global Constraints

- Keep commands and technical identifiers in their original English forms.
- Do not claim that the Chrome extension is a pnpm workspace package.
- Preserve useful application-specific operational details.
- Avoid duplicating full API documentation across READMEs.

---

### Task 1: Rewrite the root README

**Files:**
- Modify: `README.md`

- [ ] Add product positioning and the desktop-to-extension data flow.
- [ ] Add direct links to both child READMEs.
- [ ] Document repository layout, root commands, requirements, and shared docs.

### Task 2: Refine both child READMEs

**Files:**
- Modify: `apps/desktop/README.md`
- Modify: `apps/chrome-extension/README.md`

- [ ] Add navigation back to the root and across to the sibling project.
- [ ] Keep desktop architecture, local paths, development commands, and a concise API summary.
- [ ] Keep extension installation, usage, troubleshooting, and development instructions while removing repeated API payload details.
- [ ] Replace pre-monorepo directory names with current paths.

### Task 3: Verify documentation

**Files:**
- Verify: `README.md`
- Verify: `apps/desktop/README.md`
- Verify: `apps/chrome-extension/README.md`

- [ ] Check every relative Markdown link target.
- [ ] Search for obsolete repository paths.
- [ ] Run `git diff --check` and inspect the final diff.
