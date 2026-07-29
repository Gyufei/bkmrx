# bkmr-desktop — Architecture Documentation

> Version: 0.1.0 | Last updated: 2026-07-29

---

## 1. Technology Stack

| Layer | Technology | Version |
|---|---|---|
| Desktop Framework | Tauri | 2.x |
| Frontend | React | 18.x |
| Language (Frontend) | TypeScript | 5.5 |
| Styling | Tailwind CSS | 3.4 |
| Build Tool | Vite | 5.x |
| Language (Backend) | Rust | 2021 edition |
| Bookmark Engine | [bkmr](https://github.com/gyf304/bkmr) (CLI tool) | external |
| Markdown rendering / source editing | react-markdown + remark-gfm / CodeMirror 6 | 10.1.0 / 6.x |
| Fuzzy Search | Fuse.js | 7.4 |

### Dependencies

**Rust (`Cargo.toml`):**

| Crate | Purpose |
|---|---|
| `tauri` | Desktop framework core |
| `tauri-plugin-shell` | Open URLs in system browser |
| `serde` / `serde_json` | JSON serialization for IPC & settings |
| `tokio` | Async runtime |
| `chrono` | Timestamp formatting |
| `axum` / `tower-http` | Embedded HTTP server for external API |

**Frontend (`package.json` — active):**

| Package | Purpose |
|---|---|
| `@tauri-apps/api` | Tauri IPC (invoke) |
| `@tauri-apps/plugin-shell` | Open bookmark URLs |
| `react-markdown` / `remark-gfm` | Safe GFM Markdown rendering |
| `@codemirror/*` | Markdown source editing |
| `@tailwindcss/typography` | Rendered Markdown typography |
| `fuse.js` | Client-side fuzzy search for bookmarks |
| `react` / `react-dom` | UI framework |
| `tailwindcss` | CSS utility framework |

---

## 2. Architecture Overview

```
┌──────────────────────────────────────────────────────┐
│                    Tauri Shell                         │
│  ┌──────────────────────────────────────────────┐    │
│  │           Frontend (React + TypeScript)        │    │
│  │  ┌──────┐ ┌────────┐ ┌────────┐ ┌─────────┐  │    │
│  │  │ App  │ │ Hooks  │ │ Comps  │ │ Utils   │  │    │
│  │  │ tsx  │ │ useXxx │ │ *.tsx  │ │ *.ts    │  │    │
│  │  └──────┘ └────────┘ └────────┘ └─────────┘  │    │
│  │              ↕ invoke() / IPC                   │    │
│  ├──────────────────────────────────────────────┤    │
│  │          Rust Backend (Tauri Commands)         │    │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────────┐  │    │
│  │  │ bkmr.rs  │ │ notes.rs │ │ settings.rs  │  │    │
│  │  │(书签引擎)│ │(笔记管理)│ │(JSON持久化)  │  │    │
│  │  └────┬─────┘ └──────────┘ └──────────────┘  │    │
│  │       ↕ subprocess                             │    │
│  │  ┌──────────┐ ┌──────────────────────────┐    │    │
│  │  │ bkmr CLI │ │ http_server (axum)       │    │    │
│  │  └──────────┘ └──────────────────────────┘    │    │
│  └──────────────────────────────────────────────┘    │
└──────────────────────────────────────────────────────┘
```

---

## 3. Module Structure

### Frontend (`src/`)

The tree below highlights representative modules and is not a complete file listing.

```
src/
├── App.tsx                  # Root composition: query provider + system theme bridge
├── App.css                  # Global styles: scrollbar, Markdown viewer and source-editor typography
├── Layout.tsx               # Page layout and bookmark/notes/settings routing
├── Navbar.tsx               # Top-level navigation
├── main.tsx                 # React DOM entry point
├── types.ts                 # Shared TypeScript interfaces
├── vite-env.d.ts            # Vite type declarations
│
├── bookmarks/
│   ├── BookmarkView.tsx     # Bookmark browsing view
│   ├── SearchBar.tsx        # Bookmark search input
│   ├── TagPanel.tsx         # Tag filter chips
│   └── bookmarks.api.ts     # Bookmark Tauri invoke wrappers
│
├── components/
│   └── TagInput.tsx         # Shared tag input
│
├── notes/
│   ├── NotesPanel.tsx        # Three-panel note browser (tree | list | editor)
│   ├── FolderTree.tsx        # Recursive folder tree navigation
│   ├── buildFolderTree.ts    # Note tree construction
│   ├── NoteEditor.tsx        # View-first controller; lazy-loads MarkdownSourceEditor
│   ├── MarkdownViewer.tsx    # react-markdown + remark-gfm rendered view
│   ├── MarkdownSourceEditor.tsx # CodeMirror 6 source editor
│   ├── use-note-document.ts  # 400 ms versioned autosave session
│   ├── note-save.ts          # Live shared save-queue wrapper
│   └── note-save-queue.ts    # Per-path serialized write queue
│
├── settings/
│   ├── SettingsPage.tsx      # Full-page settings form
│   └── settings.api.ts       # Settings Tauri invoke wrappers
│
└── lib/
    ├── invoke.ts             # Shared Tauri invoke helper
    ├── tagColor.ts           # Deterministic tag → HSL color function
    └── utils.ts              # Shared frontend utilities
```

### Backend (`src-tauri/src/`)

```
src-tauri/src/
├── main.rs             # Tauri entry: plugin init, command registration, window events
├── lib.rs              # Module declarations
├── commands.rs         # All Tauri #[tauri::command] handlers (thin wrappers)
├── bkmr.rs             # External bkmr CLI interaction (subprocess, parse output)
├── notes.rs            # .md file scanner, frontmatter parser, file CRUD
├── settings.rs         # ~/.bkmr/settings.json read/write
└── http_server.rs      # Embedded axum HTTP server (for external API)
```

### Configuration & Misc

```
├── tailwind.config.js       # Design tokens (colors, radius, fonts)
├── postcss.config.js        # PostCSS + Tailwind plugin
├── vite.config.ts           # Vite config with Tauri dev server
├── tauri.conf.json          # Tauri app config (window, bundle, icons)
├── index.html               # HTML entry with favicon
├── package.json             # NPM dependencies
├── logo.svg                 # App icon source
└── docs/
    └── ARCHITECTURE.md      # This file
```

---

## 4. Feature Implementation Details

### 4.1 Bookmark Browser

**Tab:** "书签" | **Files:** `App.tsx`, `SearchBar.tsx`, `TagPanel.tsx`, `ResultList.tsx`

**Data flow:**
```
App startup → loadAll() → invoke("load_all_bookmarks")
                                ↕
                        bkmr CLI (subprocess)
                                ↕
                        bkmr SQLite database
```

**Search:** Dual-layer:
1. **Client-side** — `Fuse.js` indexes all bookmarks in memory, searches by `title:0.5`, `url:0.2`, `tags:0.2`, `description:0.1`
2. **Server-side** — `search_bookmarks` command delegates to `bkmr hsearch` CLI

**Filtering:** Tags from `get_all_tags` → `TagPanel` chips → intersect with search results

**Infinite scroll:** `IntersectionObserver` with 200px root margin, loads 50 items at a time

### 4.2 Note Manager

**Tab:** "笔记" | **Files:** `NotesPanel.tsx`, `NoteEditor.tsx`, `FolderTree.tsx`

**Three-panel layout:**

| Panel | Width | Content |
|---|---|---|
| LEFT (folder tree) | 192px | Recursive tree built from `relative_path` |
| MIDDLE (file list) | 224px | Files filtered by selected folder + search |
| RIGHT (editor)   | flex-1 | Rendered Markdown view or source editor |

**Backend scans:**
```
scan_notes(dir) → recursively find .md files
                      ↕
          Parse YAML frontmatter for title: and tags:
                      ↕
          Return sorted (by mtime) list
```

**Frontmatter parsing** (`notes.rs:parse_frontmatter`):
- Title: `title:` field in frontmatter, fallback to filename
- Tags: `tags: [a, b]` or `tags:\n  - a\n  - b` or `tags: single`

**Editor:**
- Opens in a rendered `MarkdownViewer` using `react-markdown` and `remark-gfm`.
- `Cmd/Ctrl + E` (or the low-emphasis edit/view button) switches to a lazily loaded
  `MarkdownSourceEditor` backed by CodeMirror 6; `Cmd/Ctrl + S` saves in place.
- `useNoteDocument` loads content per path, auto-saves after 400 ms, versions snapshots,
  and sends writes through a per-path queue so rapid file changes cannot cross-write content.
- Failed background saves remain visible with retry controls, including for a previously
  selected file.

**Create note:** "+" button → modal → `create_note_file(dir, name)` → scan → auto-select

### 4.3 Settings

**Access:** Gear icon in tab bar | **Files:** `useSettings.ts`, `SettingsPage.tsx`

**Persistence:** `~/.bkmr/settings.json` (plain JSON, serde serialization)

```json
{ "backup_dir": "/path/to/backup", "notes_dir": "/path/to/obsidian" }
```

**Startup actions:**
- `backup_dir` set → auto-export bookmarks on startup
- `notes_dir` set → auto-scan notes directory

### 4.4 Bookmark Backup

**Trigger:** Startup auto-backup + manual from settings page

**Flow:** `backup(dir)` → `invoke("backup_bookmarks")` → `bkmr export_all` CLI → JSON export

### 4.5 Tag Colors

**File:** `utils/tagColor.ts`

Deterministic color from tag name hash:
```
hash(tag) → hue(0-360) → hsl(hue, 60%, 40%) text
                        → hsla(hue, 60%, 40%, 0.12) bg
```
Used in: `ResultList.tsx` (bookmark tags), `TagPanel.tsx` (selected tag chips)

---

## 5. Tauri Commands (IPC API)

| Command | Args | Returns | Module |
|---|---|---|---|
| `load_all_bookmarks` | — | `BkmrBookmark[]` | bkmr.rs |
| `search_bookmarks` | `query?`, `tags[]` | `BkmrBookmark[]` | bkmr.rs |
| `get_all_tags` | — | `BkmrTag[]` | bkmr.rs |
| `backup_bookmarks` | `dir` | `String` (path) | bkmr.rs |
| `scan_notes` | `dir` | `NoteFile[]` | notes.rs |
| `read_note_file` | `path` | `String` (content) | notes.rs |
| `write_note_file` | `path`, `content` | — | notes.rs |
| `create_note_file` | `dir`, `name` | `String` (path) | notes.rs |
| `get_settings` | — | `Settings` | settings.rs |
| `update_settings` | `settings` | — | settings.rs |

---

## 6. Risks & Issues

### Active Issues

| Severity | Issue | Location | Status |
|---|---|---|---|
| 🟡 Medium | A background save failure for a previously selected file must remain reportable without replacing the active editor state | `use-note-document.ts` | Reported with path-specific retry controls |
| 🟡 Low | `FolderTree.tsx` recreates tree object on every render via `tree.map()` | `FolderTree.tsx:90` | Minor perf, not noticeable |
| 🟢 Low | `buildFolderTree()` is defined inside `NotesPanel.tsx` instead of utility | `NotesPanel.tsx:40` | Not reusable |

### Dead Code (safe to remove)

| File / Package | Reason |
|---|---|
| `SettingsModal.tsx` | Replaced by `SettingsPage.tsx` |
| `Pagination.tsx` | Replaced by infinite scroll in `ResultList.tsx` |

---

## 7. Extension Points

### Short-term (low effort)

| Feature | What to change |
|---|---|
| **More setting items** | Add fields to `Settings` struct + `SettingsPage.tsx` form |
| **Note renaming** | Add `rename_note_file` Rust command + right-click context menu in file list |
| **Note deletion** | Add `delete_note_file` Rust command + confirmation dialog |
| **Bookmark details view** | Click bookmark to show full metadata (description, tags, modified date) |

### Medium-term

| Feature | What to change |
|---|---|
| **Note search with full-text** | Add ripgrep/Rust grep backend for searching note content |
| **Bookmark inline edit** | Edit title/tags directly in the app and push back to bkmr |
| **Tag sidebar for notes** | Extract tags from YAML frontmatter, add tag filtering in note list |
| **Window state persistence** | Remember window position/size on restart |

### Long-term

| Feature | What to change |
|---|---|
| **Note sync** | Git-based sync or cloud storage for notes |
| **Browser extension** | Bookmark from browser directly to app |
| **Multi-vault** | Support multiple Obsidian vaults with tab switching |

---

## 8. Development Setup

```bash
# Install frontend dependencies
cd bkmr-desktop && npm install

# Run in development mode (hot reload)
npm run tauri dev

# Build for production
npm run tauri build

# Type check
npx tsc --noEmit
```

**Prerequisites:**
- Rust toolchain (rustup)
- Node.js >= 18
- `bkmr` CLI tool available in PATH
- macOS (Tauri v2 currently targets macOS for this project)

**Key ports:**
- 1420: Vite dev server (frontend)
- 1421: HMR WebSocket (dev only)

## 9. Design Decisions Record

| Decision | Rationale |
|---|---|
| JSON settings instead of `tauri-plugin-store` | Only 2 fields, no benefit from plugin complexity |
| Rendered Markdown plus lazy CodeMirror source editor | Fast, readable default view with full-fidelity Markdown editing on demand |
| Fuse.js instead of server-side search | Instant search without backend round-trip |
| Infinite scroll instead of pagination | Better UX for scroll-heavy browsing |
| Inline SVG icons instead of icon library | Zero extra dependency, small size |
