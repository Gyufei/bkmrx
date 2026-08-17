# Bookmark Adaptive Preview v2 Implementation Plan

**Goal:** Replace unconditional iframe loading with a backend-generated preview plan, add a GitHub repository summary card, and render all expected failures as a consistent in-Sheet fallback card.

**Requirement:** `docs/features/2026-08-14-bookmark-adaptive-preview-spec.md`

**Architecture:** A new Rust `PreviewService` owns URL validation, provider routing, restricted HTTP access, response classification and caching. One async Tauri command returns a tagged preview result. React requests that result and renders exactly one of GitHub summary, sandboxed iframe or fallback card while preserving the existing Sheet shell and bookmark interaction contract.

## Global constraints

- Preserve unrelated changes, including the existing modification in `apps/desktop/src/notes/NotesPanel.tsx`.
- Expected website and provider failures return `BookmarkPreview::Fallback`; only internal failures use `AppError`.
- Do not add README rendering, GitHub authentication, dynamic Provider plugins or a Tauri child WebView.
- Do not weaken the current iframe sandbox.
- Public network calls must be wrapped behind a testable adapter; automated tests must not depend on the public internet.
- Every production step follows focused RED → GREEN → regression verification.

## Phase 1: Lock the wire contract and preview module boundary

### Task 1: Add preview models and exact serialization tests

**Files:**

- Create `apps/desktop/src-tauri/src/preview/mod.rs`
- Create `apps/desktop/src-tauri/src/preview/model.rs`
- Modify `apps/desktop/src-tauri/src/lib.rs`

- [ ] Define `PrepareBookmarkPreviewRequest`, `BookmarkPreview`, `GithubRepositoryPreview` and `PreviewFallbackReason`.
- [ ] Add exact serde tests for every `kind` and representative fallback reasons.
- [ ] Re-export only the types required by the command and tests.
- [ ] Run focused Rust tests and `cargo fmt --check`.

Success: the frontend contract is stable before network behavior is implemented.

### Task 2: Add frontend contract and invoke adapter

**Files:**

- Modify `apps/desktop/src/types.ts`
- Modify `apps/desktop/src/lib/invoke.ts`
- Modify or create the relevant invoke/API tests

- [ ] Define the TypeScript discriminated union matching Rust serialization.
- [ ] Add `invokePrepareBookmarkPreview(request, forceRefresh)`.
- [ ] Test command name, camelCase argument mapping and exact return typing fixture.
- [ ] Run focused frontend tests and TypeScript checking.

Success: both sides share one explicit preview-plan contract.

## Phase 2: Build the restricted backend network layer

### Task 3: Add HTTP dependency and injectable adapter

**Files:**

- Modify `apps/desktop/src-tauri/Cargo.toml`
- Modify `apps/desktop/src-tauri/Cargo.lock`
- Create `apps/desktop/src-tauri/src/preview/web.rs`
- Create `apps/desktop/src-tauri/src/preview/security.rs`

- [ ] Add the minimum HTTP/URL dependencies needed for async requests and header parsing.
- [ ] Define a small internal HTTP adapter boundary used by preview resolvers.
- [ ] Configure connection timeout, total timeout, redirect limit, user agent and response-size behavior.
- [ ] Keep cookies and authentication disabled.
- [ ] Add tests using a mock adapter or local mock server.

Success: preview code can make deterministic, bounded requests in production and tests.

### Task 4: Implement SSRF and redirect protection

**Files:**

- Modify `apps/desktop/src-tauri/src/preview/security.rs`
- Modify `apps/desktop/src-tauri/src/preview/web.rs`

- [ ] Write failing tests for unsupported protocols, loopback, private IPv4/IPv6, link-local and unsafe redirect targets.
- [ ] Implement host/IP validation and revalidation for every redirect.
- [ ] Ensure DNS resolution cannot silently switch to an unvalidated private target.
- [ ] Verify safe public targets remain accepted.
- [ ] Run focused tests and `cargo clippy` for the preview module.

Success: arbitrary bookmarks cannot use the backend probe to reach prohibited local-network targets.

## Phase 3: Implement preview resolvers

### Task 5: Implement generic webpage classification

**Files:**

- Modify `apps/desktop/src-tauri/src/preview/web.rs`
- Add focused tests beside the module or under `apps/desktop/src-tauri/tests/`

- [ ] Write tests for successful web candidates, final redirected URL, DNS failure, connection failure, timeout and HTTP error.
- [ ] Write table-driven tests for `X-Frame-Options` values.
- [ ] Write table-driven tests for CSP `frame-ancestors` values and multiple policies.
- [ ] Implement bounded probing without downloading the complete page.
- [ ] Map every expected failure to a stable `PreviewFallbackReason` and safe user message.

Success: the generic resolver returns `Web` only when no explicit failure or embedding denial is detected.

### Task 6: Implement the GitHub repository resolver

**Files:**

- Create `apps/desktop/src-tauri/src/preview/github.rs`
- Add focused tests beside the module

- [ ] Write URL parsing tests for repository roots, repository subpaths, `.git` suffixes, reserved routes and non-GitHub hosts.
- [ ] Implement owner/repository extraction without treating reserved GitHub routes as repositories.
- [ ] Encapsulate all GitHub HTTP behavior in a dedicated client constructed with an optional credential; use `None` in the current Tauri setup.
- [ ] Keep credential lookup outside the resolver so a future settings-backed GitHub Key only changes service construction.
- [ ] Map a successful GitHub API fixture to `GithubRepositoryPreview`.
- [ ] Map 404, rate limit, timeout and malformed/upstream errors to fallback results.
- [ ] Verify upstream bodies and sensitive headers are not exposed.

Success: supported GitHub repository URLs always use API-backed summary or an explicit fallback, never iframe.

### Task 7: Implement orchestration and bounded cache

**Files:**

- Create `apps/desktop/src-tauri/src/preview/service.rs`
- Modify `apps/desktop/src-tauri/src/preview/mod.rs`

- [ ] Write tests proving GitHub routing takes precedence over generic web probing.
- [ ] Implement URL normalization and resolver ordering.
- [ ] Add bounded in-memory cache with separate success and failure TTLs.
- [ ] Add force-refresh behavior that bypasses and replaces cached entries.
- [ ] Test cache hit, expiry, capacity behavior and force refresh.

Success: one service call deterministically returns one preview plan without duplicated external requests.

## Phase 4: Expose the Tauri command

### Task 8: Register and manage PreviewService

**Files:**

- Modify `apps/desktop/src-tauri/src/commands.rs`
- Modify `apps/desktop/src-tauri/src/main.rs`
- Modify `apps/desktop/src-tauri/src/lib.rs` if needed

- [ ] Add the async `prepare_bookmark_preview` command.
- [ ] Construct one shared PreviewService during Tauri setup.
- [ ] Register the command in `generate_handler!`.
- [ ] Verify expected fallback results remain successful command responses.
- [ ] Add a command-level contract test where practical.

Success: the frontend can request a preview plan through one Tauri method.

## Phase 5: Implement the adaptive frontend UI

### Task 9: Add shared preview card shell and fallback card

**Files:**

- Create `apps/desktop/src/bookmarks/PreviewCard.tsx` if sharing materially reduces duplication
- Create `apps/desktop/src/bookmarks/PreviewFallbackCard.tsx`
- Create corresponding tests

- [ ] Write failing tests for title, message, optional HTTP status, external-open and conditional retry.
- [ ] Implement the shared 48px desktop inset, 20–24px narrow inset and 128px minimum card height.
- [ ] Map fallback reasons to stable titles, icons and retry visibility.
- [ ] Keep error color localized; do not use a full red card.
- [ ] Verify semantic buttons and accessible status text.

Success: every expected failure has a persistent, actionable in-Sheet presentation.

### Task 10: Add GitHub repository summary card

**Files:**

- Create `apps/desktop/src/bookmarks/GithubRepositoryPreview.tsx`
- Create `apps/desktop/src/bookmarks/GithubRepositoryPreview.test.tsx`

- [ ] Write failing tests for repository identity, optional description/avatar/language, metrics, update time and external-open.
- [ ] Implement the desktop three-column layout and narrow stacked action layout.
- [ ] Truncate long descriptions and preserve layout when optional fields are absent.
- [ ] Add the explanatory text below the card.

Success: a GitHub result uses the approved compact card and never mounts an iframe.

### Task 11: Refactor BookmarkWebPreview into a preview-plan state machine

**Files:**

- Modify `apps/desktop/src/bookmarks/BookmarkWebPreview.tsx`
- Modify `apps/desktop/src/bookmarks/BookmarkWebPreview.test.tsx`
- Modify `apps/desktop/src/bookmarks/BookmarkView.tsx` only if request ownership belongs there
- Modify related tests

- [ ] Write failing tests for preparing, GitHub, web, fallback and unexpected command-error states.
- [ ] Request a preview plan when a bookmark opens.
- [ ] Mount iframe only for `kind: web` and preserve the exact sandbox.
- [ ] Add an iframe UI timeout that changes to the shared fallback card without claiming the URL itself is unreachable.
- [ ] Implement toolbar refresh and card retry with `forceRefresh: true`.
- [ ] Guard against stale responses after bookmark switch or Sheet close.
- [ ] Preserve access counting, external opening, close behavior and focus restoration.

Success: no response path can leave the Sheet as unexplained blank content.

## Phase 6: Regression and real-application verification

### Task 12: Run automated verification

- [ ] Run preview-focused frontend tests.
- [ ] Run the complete desktop frontend test suite.
- [ ] Run TypeScript checking and the production frontend build.
- [ ] Run preview-focused Rust tests and the full Rust test suite.
- [ ] Run `cargo fmt --check`, relevant `cargo clippy`, and `git diff --check`.
- [ ] Confirm unrelated working-tree changes were not modified.

Success: all automated checks pass without widening feature scope.

### Task 13: Perform Tauri smoke testing

- [ ] Verify a public GitHub repository and repository subpage.
- [ ] Verify a GitHub non-repository page.
- [ ] Verify an embeddable HTTPS page.
- [ ] Verify an embedding-denied page.
- [ ] Verify timeout, DNS failure, HTTP error and retry behavior using controlled endpoints.
- [ ] Verify rapid bookmark switching, close-during-request, refresh, resizing and light/dark themes.
- [ ] Verify external opening and access counting remain correct.

Success: observed behavior matches the spec in a packaged or development Tauri runtime.

### Task 14: Review before merge

- [ ] Review the feature diff against `docs/features/2026-08-14-bookmark-adaptive-preview-spec.md`.
- [ ] Pay special attention to SSRF, redirect handling, CSP parsing, stale request races, error leakage and duplicated access counts.
- [ ] Apply only in-scope fixes and rerun affected checks.

Success: the implementation is ready for merge with no unresolved correctness or security findings.
