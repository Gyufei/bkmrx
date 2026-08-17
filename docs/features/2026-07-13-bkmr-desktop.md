# bkmr-desktop Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wrap bkmr as a native macOS desktop app with search UI, HTTP service (with API docs), and auto-backup.

**Architecture:** Tauri v2 app with React+TypeScript frontend. Rust backend calls bkmr CLI via `tokio::process::Command`. Axum HTTP server runs alongside Tauri for browser extension support. Frontend handles all pagination client-side (fetch limit 1000, display 10 per page).

**Tech Stack:** Tauri v2, React 18, TypeScript, Vite, Tailwind CSS 3, Axum, tokio, serde, serde_json

## Global Constraints

- Project directory: `/Users/gyf/MyLib/bkmr-sync/bkmr-desktop/`
- HTTP server: `127.0.0.1:8733`, no auth
- Search results: fetch `--limit 1000`, display 10 per page, paginate client-side
- Typography: system font stack (SF Pro on macOS)
- Theme: follow system dark/light via `prefers-color-scheme`
- Tooling: use `npx @tauri-apps/cli` for Tauri commands (no global install)
- App will be run via `npx tauri dev` in the `bkmr-desktop/` directory

---

### Task 1: Scaffold Project Foundation

**Files:**
- Create: `bkmr-desktop/` (entire Tauri v2 project with React-TS template)
- Create/modify: `bkmr-desktop/src-tauri/Cargo.toml`, `bkmr-desktop/package.json`, Tailwind configs

**Interfaces:**
- Produces: A compilable Tauri v2 project that compiles with `npx tauri build` and opens a blank window

- [ ] **Step 1: Create Tauri v2 project using non-interactive scaffolding**

```bash
cd /Users/gyf/MyLib/bkmr-sync
npm create tauri-app@latest bkmr-desktop -- --template react-ts --manager npm 2>&1 || true
```

If scaffolding fails (non-interactive issues), manually create the project structure with these key files:

**`bkmr-desktop/package.json`**:
```json
{
  "name": "bkmr-desktop",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "preview": "vite preview",
    "tauri": "tauri"
  },
  "dependencies": {
    "@tauri-apps/api": "^2",
    "@tauri-apps/plugin-shell": "^2",
    "react": "^18.3.1",
    "react-dom": "^18.3.1"
  },
  "devDependencies": {
    "@tauri-apps/cli": "^2",
    "@types/react": "^18.3.0",
    "@types/react-dom": "^18.3.0",
    "@vitejs/plugin-react": "^4.3.0",
    "autoprefixer": "^10.4.19",
    "postcss": "^8.4.38",
    "tailwindcss": "^3.4.4",
    "typescript": "^5.5.0",
    "vite": "^5.4.0"
  }
}
```

**`bkmr-desktop/src-tauri/Cargo.toml`**:
```toml
[package]
name = "bkmr-desktop"
version = "0.1.0"
edition = "2021"

[lib]
name = "bkmr_desktop_lib"
crate-type = ["staticlib", "cdylib", "rlib"]

[build-dependencies]
tauri-build = { version = "2", features = [] }

[dependencies]
tauri = { version = "2", features = ["tray-icon"] }
tauri-plugin-shell = "2"
serde = { version = "1", features = ["derive"] }
serde_json = "1"
tokio = { version = "1", features = ["full"] }
axum = "0.7"
tower-http = { version = "0.5", features = ["cors"] }
```

**`bkmr-desktop/src-tauri/build.rs`**:
```rust
fn main() {
    tauri_build::build()
}
```

**`bkmr-desktop/src-tauri/tauri.conf.json`**:
```json
{
  "productName": "bkmr-desktop",
  "version": "0.1.0",
  "identifier": "com.bkmr.desktop",
  "build": {
    "frontendDist": "../dist",
    "devUrl": "http://localhost:1420",
    "beforeDevCommand": "npm run dev",
    "beforeBuildCommand": "npm run build"
  },
  "app": {
    "title": "bkmr-desktop",
    "windows": [
      {
        "title": "bkmr-desktop",
        "width": 960,
        "height": 640
      }
    ],
    "security": {
      "csp": null
    }
  },
  "bundle": {
    "active": true,
    "targets": "all",
    "icon": [
      "icons/32x32.png",
      "icons/128x128.png",
      "icons/128x128@2x.png",
      "icons/icon.icns",
      "icons/icon.ico"
    ]
  }
}
```

**`bkmr-desktop/src-tauri/capabilities/default.json`**:
```json
{
  "identifier": "default",
  "description": "Capability for the main window",
  "windows": ["main"],
  "permissions": [
    "core:default",
    "shell:allow-open"
  ]
}
```

**`bkmr-desktop/tsconfig.json`**:
```json
{
  "compilerOptions": {
    "target": "ES2020",
    "useDefineForClassFields": true,
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true
  },
  "include": ["src"],
  "references": [{ "path": "./tsconfig.node.json" }]
}
```

**`bkmr-desktop/tsconfig.node.json`**:
```json
{
  "compilerOptions": {
    "composite": true,
    "skipLibCheck": true,
    "module": "ESNext",
    "moduleResolution": "bundler",
    "allowSyntheticDefaultImports": true
  },
  "include": ["vite.config.ts"]
}
```

**`bkmr-desktop/vite.config.ts`**:
```ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const host = process.env.TAURI_DEV_HOST;

export default defineConfig(async () => ({
  plugins: [react()],
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      ignored: ["**/src-tauri/**"],
    },
  },
}));
```

**`bkmr-desktop/index.html`**:
```html
<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <link rel="icon" type="image/svg+xml" href="/vite.svg" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>bkmr-desktop</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

**`bkmr-desktop/src/main.tsx`**:
```tsx
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./App.css";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
```

**`bkmr-desktop/src/vite-env.d.ts`**:
```ts
/// <reference types="vite/client" />
```

- [ ] **Step 2: Configure Tailwind CSS**

**`bkmr-desktop/tailwind.config.js`**:
```js
/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  darkMode: "media",
  theme: {
    extend: {
      colors: {
        surface: {
          DEFAULT: "#FAFAF9",
          sidebar: "#F5F5F4",
          card: "#FFFFFF",
          dark: "#1C1917",
          "dark-sidebar": "#292524",
          "dark-card": "#292524",
        },
        border: {
          DEFAULT: "#E7E5E4",
          dark: "#44403C",
        },
        text: {
          primary: "#1C1917",
          secondary: "#78716C",
          "dark-primary": "#FAFAF9",
          "dark-secondary": "#A8A29E",
        },
        accent: {
          DEFAULT: "#2563EB",
          hover: "#1D4ED8",
          "dark": "#60A5FA",
          "bg": "#EFF6FF",
          "dark-bg": "#1E3A5F",
        },
        danger: {
          DEFAULT: "#DC2626",
          dark: "#F87171",
        },
      },
      fontFamily: {
        sans: [
          '-apple-system', 'BlinkMacSystemFont', '"SF Pro Text"',
          '"SF Pro Display"', '"Segoe UI"', 'Roboto', 'sans-serif',
        ],
      },
      borderRadius: {
        card: "8px",
        chip: "6px",
        btn: "6px",
        input: "8px",
        modal: "12px",
      },
    },
  },
  plugins: [],
};
```

**`bkmr-desktop/postcss.config.js`**:
```js
export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};
```

Replace `bkmr-desktop/src/App.css` with:
```css
@tailwind base;
@tailwind components;
@tailwind utilities;
```

- [ ] **Step 3: Create empty Rust source stubs**

**`bkmr-desktop/src-tauri/src/lib.rs`**: Empty for now (will fill in Task 2)
**`bkmr-desktop/src-tauri/src/main.rs`**: Minimal entry that runs Tauri

```rust
// Pre-configured Tauri App (will be replaced with full impl in Task 2)
fn main() {
    tauri::Builder::default()
        .run(tauri::generate_context!())
        .expect("error while running bkmr-desktop");
}
```

- [ ] **Step 4: Install npm dependencies**

```bash
cd /Users/gyf/MyLib/bkmr-sync/bkmr-desktop
npm install
```

Run: `npm install` from `bkmr-desktop/` directory

- [ ] **Step 5: Verify the project compiles**

```bash
cd /Users/gyf/MyLib/bkmr-sync/bkmr-desktop
npx tauri build --ci
```

Expected: Build succeeds, produces a .app bundle in `src-tauri/target/release/bundle/macos/`

---

### Task 2: Rust Backend (bkmr CLI wrapper, Tauri commands, HTTP server)

**Files:**
- Modify: `bkmr-desktop/src-tauri/src/lib.rs`
- Modify: `bkmr-desktop/src-tauri/src/main.rs`
- Create: `bkmr-desktop/src-tauri/src/bkmr.rs` — async bkmr CLI wrapper
- Create: `bkmr-desktop/src-tauri/src/commands.rs` — Tauri commands
- Create: `bkmr-desktop/src-tauri/src/http_server.rs` — Axum HTTP service

**Interfaces:**
- Consumes: Project scaffold from Task 1 (Cargo.toml with correct dependencies)
- Produces: Rust crate with these public symbols:
  - `bkmr::search(query, tags) -> Vec<BkmrBookmark>`
  - `bkmr::get_tags() -> Vec<BkmrTag>`
  - `bkmr::add_bookmark(url, title, tags) -> i64`
  - `bkmr::export_all(dir) -> String` (returns file path)
  - `commands::search_bookmarks(...)` (Tauri command)
  - `commands::get_all_tags(...)` (Tauri command)
  - `commands::backup_bookmarks(...)` (Tauri command)
  - `http_server::start_server(shutdown_rx)` — starts Axum on :8733
  - `main.rs` — wires Tauri + HTTP server together

- [ ] **Step 1: Create bkmr CLI wrapper (`bkmr.rs`)**

```rust
use serde::{Deserialize, Serialize};
use std::process::Stdio;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BkmrBookmark {
    pub id: u64,
    pub url: String,
    pub title: String,
    pub tags: Vec<String>,
    #[serde(default)]
    pub description: String,
    #[serde(default)]
    pub modified: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BkmrTag {
    pub name: String,
    pub count: u64,
}

/// Perform a hybrid search (full-text + semantic) via bkmr hsearch.
pub async fn hsearch(query: &str, tags: &[String]) -> Result<Vec<BkmrBookmark>, String> {
    let mut cmd = tokio::process::Command::new("bkmr");
    cmd.args(["hsearch", "--json", "--limit", "1000"]);
    if !tags.is_empty() {
        cmd.arg("--tags");
        cmd.arg(tags.join(","));
    }
    cmd.arg(query);
    run_bkmr(cmd).await
}

/// Search bookmarks by tags only (no text query), using bkmr search.
pub async fn search_by_tags(tags: &[String]) -> Result<Vec<BkmrBookmark>, String> {
    let mut cmd = tokio::process::Command::new("bkmr");
    cmd.args(["search", "--json", "--limit", "1000"]);
    if !tags.is_empty() {
        cmd.arg("--tags");
        cmd.arg(tags.join(","));
    }
    run_bkmr(cmd).await
}

/// Get all tags with counts.
pub async fn get_tags() -> Result<Vec<BkmrTag>, String> {
    let mut cmd = tokio::process::Command::new("bkmr");
    cmd.args(["tags", "--json"]);
    let output = cmd.output().await.map_err(|e| format!("Failed to run bkmr tags: {e}"))?;
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("bkmr tags failed: {stderr}"));
    }
    serde_json::from_slice(&output.stdout)
        .map_err(|e| format!("Failed to parse bkmr tags output: {e}"))
}

/// Add a bookmark via bkmr add. Returns the new bookmark ID.
pub async fn add_bookmark(url: &str, title: &str, tags: &[String]) -> Result<u64, String> {
    let mut cmd = tokio::process::Command::new("bkmr");
    cmd.arg("add");
    cmd.arg("--title");
    cmd.arg(title);
    if !tags.is_empty() {
        cmd.arg(tags.join(","));
    }
    cmd.arg(url);

    let output = cmd.output().await.map_err(|e| format!("Failed to run bkmr add: {e}"))?;
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("bkmr add failed: {stderr}"));
    }
    // bkmr add prints: "Added: <title> (ID: <id>)" — parse the ID
    let stdout = String::from_utf8_lossy(&output.stdout);
    let id_str = stdout.split("ID: ").nth(1).and_then(|s| s.trim_end_matches(')').trim().split_whitespace().next());
    id_str.and_then(|s| s.parse().ok())
        .ok_or_else(|| format!("Could not parse bookmark ID from: {stdout}"))
}

/// Export all bookmarks as JSON to a file. Returns the file path.
pub async fn export_all(dir: &str) -> Result<String, String> {
    let date = chrono::Local::now().format("%Y-%m-%d").to_string();
    let filename = format!("bookmarks-{date}.json");
    let path = std::path::Path::new(dir).join(&filename);

    let output = tokio::process::Command::new("bkmr")
        .args(["search", "--json", "--limit", "10000"])
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output()
        .await
        .map_err(|e| format!("Failed to run bkmr search: {e}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("bkmr search failed: {stderr}"));
    }

    // Format JSON nicely and write to file
    let bookmarks: serde_json::Value = serde_json::from_slice(&output.stdout)
        .map_err(|e| format!("Failed to parse bkmr output: {e}"))?;
    let pretty = serde_json::to_string_pretty(&bookmarks)
        .map_err(|e| format!("Failed to format JSON: {e}"))?;
    tokio::fs::write(&path, &pretty)
        .await
        .map_err(|e| format!("Failed to write backup file: {e}"))?;

    Ok(path.to_string_lossy().to_string())
}

async fn run_bkmr(mut cmd: tokio::process::Command) -> Result<Vec<BkmrBookmark>, String> {
    let output = cmd.output().await.map_err(|e| format!("Failed to run bkmr: {e}"))?;
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("bkmr command failed: {stderr}"));
    }
    serde_json::from_slice(&output.stdout)
        .map_err(|e| format!("Failed to parse bkmr output: {e}"))
}
```

Add `chrono` to Cargo.toml dependencies:
```toml
chrono = "0.4"
```

Also fix the `tauri` features — `tray-icon` isn't needed (the design says no tray). Change to:
```toml
tauri = { version = "2", features = [] }
```

- [ ] **Step 2: Create Tauri commands (`commands.rs`)**

```rust
use crate::bkmr;
use tauri::State;
use std::sync::Mutex;

pub struct AppState {
    pub backup_dir: Mutex<Option<String>>,
}

#[tauri::command]
pub async fn search_bookmarks(
    query: Option<String>,
    tags: Vec<String>,
) -> Result<Vec<bkmr::BkmrBookmark>, String> {
    match (query, tags.as_slice()) {
        (Some(q), _) if !q.trim().is_empty() => {
            bkmr::hsearch(q.trim(), &tags).await
        }
        (_, []) => {
            // No query, no tags — return empty results
            Ok(Vec::new())
        }
        _ => {
            // No query, but has tags
            bkmr::search_by_tags(&tags).await
        }
    }
}

#[tauri::command]
pub async fn get_all_tags() -> Result<Vec<bkmr::BkmrTag>, String> {
    bkmr::get_tags().await
}

#[tauri::command]
pub async fn backup_bookmarks(
    dir: String,
) -> Result<String, String> {
    bkmr::export_all(&dir).await
}

#[tauri::command]
pub async fn get_backup_dir(state: State<'_, AppState>) -> Result<Option<String>, String> {
    let guard = state.backup_dir.lock().map_err(|e| e.to_string())?;
    Ok(guard.clone())
}

#[tauri::command]
pub async fn set_backup_dir(
    dir: Option<String>,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let mut guard = state.backup_dir.lock().map_err(|e| e.to_string())?;
    *guard = dir;
    Ok(())
}
```

- [ ] **Step 3: Create HTTP server (`http_server.rs`)**

```rust
use axum::{
    extract::State,
    http::StatusCode,
    response::{Html, IntoResponse, Json},
    routing::{get, post},
    Router,
};
use serde::Deserialize;
use std::sync::Arc;

struct HttpState {
    // We use a separate reference since Axum runs in a tokio task
}

pub async fn start_server(shutdown_rx: tokio::sync::oneshot::Receiver<()>) {
    let app = Router::new()
        .route("/api/bookmarks", post(add_bookmark_handler))
        .route("/api/tags", get(get_tags_handler))
        .route("/api/docs", get(docs_handler));

    let addr = std::net::SocketAddr::from(([127, 0, 0, 1], 8733));
    let listener = match tokio::net::TcpListener::bind(addr).await {
        Ok(l) => l,
        Err(e) => {
            eprintln!("Failed to bind HTTP server on 127.0.0.1:8733: {e}");
            return;
        }
    };

    axum::serve(listener, app)
        .with_graceful_shutdown(async { shutdown_rx.await.ok(); })
        .await
        .unwrap_or_else(|e| eprintln!("HTTP server error: {e}"));
}

#[derive(Deserialize)]
struct AddBookmarkRequest {
    url: String,
    title: Option<String>,
    #[serde(default)]
    tags: Vec<String>,
}

async fn add_bookmark_handler(
    Json(req): Json<AddBookmarkRequest>,
) -> Result<Json<serde_json::Value>, (StatusCode, Json<serde_json::Value>)> {
    let title = req.title.unwrap_or_else(|| req.url.clone());
    match crate::bkmr::add_bookmark(&req.url, &title, &req.tags).await {
        Ok(id) => Ok(Json(serde_json::json!({
            "id": id,
            "status": "created"
        }))),
        Err(e) => Err((
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({ "error": e })),
        )),
    }
}

async fn get_tags_handler() -> Result<Json<serde_json::Value>, (StatusCode, String)> {
    match crate::bkmr::get_tags().await {
        Ok(tags) => Ok(Json(serde_json::to_value(tags).unwrap())),
        Err(e) => Err((StatusCode::INTERNAL_SERVER_ERROR, e)),
    }
}

async fn docs_handler() -> Html<&'static str> {
    Html(include_str!("api_docs.html"))
}
```

- [ ] **Step 4: Create API docs HTML page**

**`bkmr-desktop/src-tauri/src/api_docs.html`**:
```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>bkmr-desktop API Docs</title>
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", sans-serif; max-width: 800px; margin: 40px auto; padding: 0 20px; color: #1C1917; background: #FAFAF9; }
  h1 { font-size: 24px; font-weight: 600; margin-bottom: 4px; }
  h2 { font-size: 18px; font-weight: 600; margin-top: 32px; margin-bottom: 8px; border-bottom: 1px solid #E7E5E4; padding-bottom: 4px; }
  h3 { font-size: 15px; font-weight: 600; margin-top: 20px; margin-bottom: 4px; }
  code { background: #F5F5F4; padding: 2px 6px; border-radius: 4px; font-size: 13px; }
  pre { background: #F5F5F4; padding: 12px 16px; border-radius: 8px; overflow-x: auto; font-size: 13px; }
  .endpoint { font-family: monospace; font-size: 14px; background: #EFF6FF; padding: 8px 12px; border-radius: 6px; margin: 8px 0; }
  .method { font-weight: 700; }
  .method.post { color: #059669; }
  .method.get { color: #2563EB; }
  table { width: 100%; border-collapse: collapse; margin: 12px 0; }
  th, td { text-align: left; padding: 8px 12px; border-bottom: 1px solid #E7E5E4; font-size: 14px; }
  th { background: #F5F5F4; font-weight: 600; }
  .tag { background: #E7E5E4; padding: 2px 8px; border-radius: 4px; font-size: 12px; }
</style>
</head>
<body>

<h1>bkmr-desktop API</h1>
<p style="color: #78716C; font-size: 14px;">HTTP service running on <code>127.0.0.1:8733</code></p>

<h2>Endpoints</h2>

<div class="endpoint">
  <span class="method get">GET</span> /api/tags
</div>
<p style="font-size: 14px;">获取所有标签及其数量，用于 Chrome 插件中的分类选择。</p>

<h3>Response 200 OK</h3>
<pre>[
  { "name": "fe", "count": 852 },
  { "name": "全栈", "count": 323 }
]</pre>

<div class="endpoint">
  <span class="method post">POST</span> /api/bookmarks
</div>
<p style="font-size: 14px;">添加书签到 bkmr 数据库。</p>

<h3>Request Body</h3>
<pre>{
  "url": "https://example.com",
  "title": "Example Title",
  "tags": ["dev", "rust"]
}</pre>

<table>
  <tr><th>字段</th><th>类型</th><th>必需</th><th>说明</th></tr>
  <tr><td><code>url</code></td><td>string</td><td>是</td><td>书签 URL</td></tr>
  <tr><td><code>title</code></td><td>string</td><td>否</td><td>书签标题，缺省则使用 URL</td></tr>
  <tr><td><code>tags</code></td><td>string[]</td><td>否</td><td>标签列表，缺省为空</td></tr>
</table>

<h3>Response 201 Created</h3>
<pre>{ "id": 1234, "status": "created" }</pre>

<h3>Error Response</h3>
<pre>{ "error": "bkmr add failed: ..." }</pre>

<p style="color: #78716C; font-size: 13px; margin-top: 32px;">
  Authentication: None. Listen-only on 127.0.0.1.
</p>

</body>
</html>
```

- [ ] **Step 5: Create `lib.rs` — export bkmr module**

```rust
pub mod bkmr;
pub mod commands;
pub mod http_server;
```

- [ ] **Step 6: Update `main.rs` — wire everything together**

```rust
use std::sync::Mutex;

fn main() {
    let (shutdown_tx, shutdown_rx) = tokio::sync::oneshot::channel::<()>();

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .manage(bkmr_desktop_lib::commands::AppState {
            backup_dir: Mutex::new(None),
        })
        .setup(|_app| {
            // Start HTTP server in a background tokio task
            tauri::async_runtime::spawn(
                bkmr_desktop_lib::http_server::start_server(shutdown_rx)
            );
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            bkmr_desktop_lib::commands::search_bookmarks,
            bkmr_desktop_lib::commands::get_all_tags,
            bkmr_desktop_lib::commands::backup_bookmarks,
            bkmr_desktop_lib::commands::get_backup_dir,
            bkmr_desktop_lib::commands::set_backup_dir,
        ])
        .on_window_event(move |window| {
            if let tauri::WindowEvent::CloseRequested { .. } = window.event() {
                let _ = shutdown_tx.send(());
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running bkmr-desktop");
}
```

- [ ] **Step 7: Build and verify**

```bash
cd /Users/gyf/MyLib/bkmr-sync/bkmr-desktop
npx tauri build --ci 2>&1 | tail -30
```

Expected: Build succeeds. The HTTP server code, Tauri commands, and CLI wrapper are all compiled.

---

### Task 3: React Frontend (all UI components)

**Files:**
- Create: `bkmr-desktop/src/types.ts`
- Create: `bkmr-desktop/src/hooks/useBkmr.ts`
- Create: `bkmr-desktop/src/components/SearchBar.tsx`
- Create: `bkmr-desktop/src/components/TagPanel.tsx`
- Create: `bkmr-desktop/src/components/ResultList.tsx`
- Create: `bkmr-desktop/src/components/Pagination.tsx`
- Create: `bkmr-desktop/src/components/SettingsModal.tsx`
- Modify: `bkmr-desktop/src/App.tsx`
- Modify: `bkmr-desktop/src/App.css`

**Interfaces:**
- Consumes: Tauri commands from Task 2 (`search_bookmarks`, `get_all_tags`, `backup_bookmarks`, `get_backup_dir`, `set_backup_dir`)
- Produces: Full functional app

- [ ] **Step 1: Create shared types (`src/types.ts`)**

```ts
export interface Bookmark {
  id: number;
  url: string;
  title: string;
  tags: string[];
  description?: string;
  modified?: string;
}

export interface Tag {
  name: string;
  count: number;
}
```

- [ ] **Step 2: Create useBkmr hook (`src/hooks/useBkmr.ts`)**

```ts
import { useState, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { Bookmark, Tag } from "../types";

export function useBkmr() {
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const search = useCallback(async (query: string, tags: string[]) => {
    setLoading(true);
    setError(null);
    try {
      const q = query.trim() || null;
      const result = await invoke<Bookmark[]>("search_bookmarks", {
        query: q,
        tags,
      });
      setBookmarks(result);
    } catch (e) {
      setError(String(e));
      setBookmarks([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchTags = useCallback(async (): Promise<Tag[]> => {
    try {
      return await invoke<Tag[]>("get_all_tags");
    } catch {
      return [];
    }
  }, []);

  const backup = useCallback(async (dir: string): Promise<string> => {
    return await invoke<string>("backup_bookmarks", { dir });
  }, []);

  const getBackupDir = useCallback(async (): Promise<string | null> => {
    return await invoke<string | null>("get_backup_dir");
  }, []);

  const setBackupDir = useCallback(async (dir: string | null) => {
    await invoke("set_backup_dir", { dir });
  }, []);

  return {
    bookmarks, loading, error,
    search, fetchTags, backup, getBackupDir, setBackupDir,
  };
}
```

- [ ] **Step 3: Create SearchBar (`src/components/SearchBar.tsx`)**

```tsx
import { useState, type KeyboardEvent } from "react";

interface Props {
  onSearch: (query: string) => void;
  loading: boolean;
}

export default function SearchBar({ onSearch, loading }: Props) {
  const [value, setValue] = useState("");

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      onSearch(value);
    }
  };

  return (
    <div className="relative">
      <input
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="搜索书签..."
        className="w-full h-10 pl-4 pr-10 text-[15px] font-medium rounded-input border border-border dark:border-border-dark bg-surface-card dark:bg-surface-dark-card text-text-primary dark:text-text-dark-primary placeholder:text-text-secondary dark:placeholder:text-text-dark-secondary outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent dark:focus:ring-accent-dark/30 dark:focus:border-accent-dark transition-colors"
        disabled={loading}
      />
      <button
        onClick={() => onSearch(value)}
        disabled={loading}
        className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-btn text-text-secondary dark:text-text-dark-secondary hover:text-accent dark:hover:text-accent-dark transition-colors disabled:opacity-50"
        title="搜索"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="11" cy="11" r="8"/>
          <path d="m21 21-4.3-4.3"/>
        </svg>
      </button>
    </div>
  );
}
```

- [ ] **Step 4: Create TagPanel (`src/components/TagPanel.tsx`)**

```tsx
import { useEffect, useState, useCallback } from "react";
import type { Tag } from "../types";

interface Props {
  fetchTags: () => Promise<Tag[]>;
  selectedTags: string[];
  onTagsChange: (tags: string[]) => void;
  onSearch: () => void;
}

export default function TagPanel({ fetchTags, selectedTags, onTagsChange, onSearch }: Props) {
  const [tags, setTags] = useState<Tag[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    fetchTags().then((result) => {
      setTags(result.sort((a, b) => b.count - a.count));
      setLoading(false);
    });
  }, [fetchTags]);

  const toggleTag = useCallback((name: string) => {
    onTagsChange(
      selectedTags.includes(name)
        ? selectedTags.filter((t) => t !== name)
        : [...selectedTags, name]
    );
  }, [selectedTags, onTagsChange]);

  const selectAll = useCallback(() => {
    onTagsChange(tags.map((t) => t.name));
  }, [tags, onTagsChange]);

  const clearAll = useCallback(() => {
    onTagsChange([]);
  }, [onTagsChange]);

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between mb-2 px-1">
        <span className="text-sm font-semibold text-text-primary dark:text-text-dark-primary">标签筛选</span>
        {tags.length > 0 && (
          <div className="flex gap-2 text-xs">
            <button onClick={selectAll} className="text-accent dark:text-accent-dark hover:underline">全选</button>
            <button onClick={clearAll} className="text-text-secondary dark:text-text-dark-secondary hover:underline">清除</button>
          </div>
        )}
      </div>
      <div className="flex-1 overflow-y-auto space-y-0.5 pr-1">
        {loading ? (
          <div className="text-sm text-text-secondary dark:text-text-dark-secondary py-4 text-center">加载中...</div>
        ) : (
          tags.map((tag) => (
            <label
              key={tag.name}
              className="flex items-center gap-2 px-2 py-1.5 rounded-card hover:bg-accent-bg dark:hover:bg-accent-dark-bg cursor-pointer transition-colors group"
            >
              <input
                type="checkbox"
                checked={selectedTags.includes(tag.name)}
                onChange={() => toggleTag(tag.name)}
                className="rounded border-border dark:border-border-dark text-accent dark:text-accent-dark focus:ring-accent/30 dark:focus:ring-accent-dark/30"
              />
              <span className="flex-1 text-sm text-text-primary dark:text-text-dark-primary truncate">{tag.name}</span>
              <span className="text-xs text-text-secondary dark:text-text-dark-secondary tabular-nums">{tag.count}</span>
            </label>
          ))
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Create ResultList (`src/components/ResultList.tsx`)**

```tsx
import type { Bookmark } from "../types";

interface Props {
  bookmarks: Bookmark[];
  loading: boolean;
  error: string | null;
}

import { open } from "@tauri-apps/plugin-shell";
export default function ResultList({ bookmarks, loading, error }: Props) {
  if (loading) {
    return (
      <div className="flex items-center justify-center h-48 text-sm text-text-secondary dark:text-text-dark-secondary">
        搜索中...
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-48 text-sm text-danger dark:text-danger-dark">
        {error}
      </div>
    );
  }

  if (bookmarks.length === 0) {
    return (
      <div className="flex items-center justify-center h-48 text-sm text-text-secondary dark:text-text-dark-secondary">
        输入关键词搜索书签
      </div>
    );
  }

  return (
    <div className="space-y-1">
      {bookmarks.map((bm) => (
        <BookmarkRow key={bm.id} bookmark={bm} />
      ))}
    </div>
  );
}

function BookmarkRow({ bookmark }: { bookmark: Bookmark }) {
  const handleClick = () => {
    open(bookmark.url);
  };

  return (
    <div
      onClick={handleClick}
      className="block px-4 py-3 rounded-card hover:bg-accent-bg dark:hover:bg-accent-dark-bg cursor-pointer transition-colors group"
    >
      <div className="text-sm font-medium text-text-primary dark:text-text-dark-primary group-hover:text-accent dark:group-hover:text-accent-dark transition-colors truncate">
        {bookmark.title || bookmark.url}
      </div>
      <div className="text-xs text-text-secondary dark:text-text-dark-secondary truncate mt-0.5">
        {bookmark.url}
      </div>
      {bookmark.tags.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-1.5">
          {bookmark.tags.map((tag) => (
            <span
              key={tag}
              className="inline-block px-2 py-0.5 text-xs rounded-chip bg-border dark:bg-border-dark text-text-secondary dark:text-text-dark-secondary"
            >
              {tag}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 6: Create Pagination (`src/components/Pagination.tsx`)**

```tsx
interface Props {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}

export default function Pagination({ currentPage, totalPages, onPageChange }: Props) {
  if (totalPages <= 1) return null;

  return (
    <div className="flex items-center justify-center gap-2 py-3">
      <button
        onClick={() => onPageChange(currentPage - 1)}
        disabled={currentPage <= 1}
        className="px-3 py-1 text-sm rounded-btn border border-border dark:border-border-dark text-text-primary dark:text-text-dark-primary hover:bg-accent-bg dark:hover:bg-accent-dark-bg disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
      >
        上一页
      </button>
      {Array.from({ length: totalPages }, (_, i) => i + 1)
        .filter((p) => p === 1 || p === totalPages || Math.abs(p - currentPage) <= 2)
        .map((p, idx, arr) => (
          <span key={p} className="flex items-center">
            {idx > 0 && arr[idx - 1] !== p - 1 && (
              <span className="px-1 text-text-secondary dark:text-text-dark-secondary">...</span>
            )}
            <button
              onClick={() => onPageChange(p)}
              className={`px-3 py-1 text-sm rounded-btn transition-colors ${
                p === currentPage
                  ? "bg-accent text-white dark:bg-accent-dark"
                  : "border border-border dark:border-border-dark text-text-primary dark:text-text-dark-primary hover:bg-accent-bg dark:hover:bg-accent-dark-bg"
              }`}
            >
              {p}
            </button>
          </span>
        ))}
      <button
        onClick={() => onPageChange(currentPage + 1)}
        disabled={currentPage >= totalPages}
        className="px-3 py-1 text-sm rounded-btn border border-border dark:border-border-dark text-text-primary dark:text-text-dark-primary hover:bg-accent-bg dark:hover:bg-accent-dark-bg disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
      >
        下一页
      </button>
    </div>
  );
}
```

- [ ] **Step 7: Create SettingsModal (`src/components/SettingsModal.tsx`)**

```tsx
import { useState, useEffect } from "react";

interface Props {
  open: boolean;
  onClose: () => void;
  getBackupDir: () => Promise<string | null>;
  setBackupDir: (dir: string | null) => Promise<void>;
  onBackupNow: (dir: string) => Promise<string>;
}

export default function SettingsModal({ open, onClose, getBackupDir, setBackupDir, onBackupNow }: Props) {
  const [dir, setDir] = useState("");
  const [saving, setSaving] = useState(false);
  const [backupStatus, setBackupStatus] = useState<string | null>(null);
  const [backupLoading, setBackupLoading] = useState(false);

  useEffect(() => {
    if (open) {
      getBackupDir().then((d) => setDir(d ?? ""));
    }
  }, [open, getBackupDir]);

  const handleSave = async () => {
    setSaving(true);
    await setBackupDir(dir || null);
    setSaving(false);
  };

  const handleBackupNow = async () => {
    if (!dir) return;
    setBackupLoading(true);
    setBackupStatus(null);
    try {
      const path = await onBackupNow(dir);
      setBackupStatus(`已备份到: ${path}`);
    } catch (e) {
      setBackupStatus(`备份失败: ${e}`);
    } finally {
      setBackupLoading(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
      <div className="w-[420px] bg-surface-card dark:bg-surface-dark-card rounded-modal shadow-lg p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-text-primary dark:text-text-dark-primary">设置</h2>
          <button onClick={onClose} className="p-1 text-text-secondary dark:text-text-dark-secondary hover:text-text-primary dark:hover:text-text-dark-primary">
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 6 6 18"/><path d="m6 6 12 12"/>
            </svg>
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-text-primary dark:text-text-dark-primary mb-1">备份目录</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={dir}
                onChange={(e) => setDir(e.target.value)}
                placeholder="留空则不自动备份"
                className="flex-1 h-9 px-3 text-sm rounded-input border border-border dark:border-border-dark bg-surface dark:bg-surface-dark text-text-primary dark:text-text-dark-primary placeholder:text-text-secondary dark:placeholder:text-text-dark-secondary outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent"
              />
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-4 h-9 text-sm font-medium rounded-btn bg-accent text-white hover:bg-accent-hover dark:bg-accent-dark transition-colors disabled:opacity-50"
              >
                {saving ? "保存..." : "保存"}
              </button>
            </div>
            <p className="text-xs text-text-secondary dark:text-text-dark-secondary mt-1">应用启动时会自动导出到此目录</p>
          </div>

          <div>
            <button
              onClick={handleBackupNow}
              disabled={backupLoading || !dir}
              className="px-4 h-9 text-sm font-medium rounded-btn border border-border dark:border-border-dark text-text-primary dark:text-text-dark-primary hover:bg-accent-bg dark:hover:bg-accent-dark-bg transition-colors disabled:opacity-50"
            >
              {backupLoading ? "备份中..." : "立即备份"}
            </button>
            {backupStatus && (
              <p className="text-xs text-text-secondary dark:text-text-dark-secondary mt-1 break-all">{backupStatus}</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 8: Replace `App.tsx` — main layout**

```tsx
import { useState, useCallback, useEffect, useMemo } from "react";
import { useBkmr } from "./hooks/useBkmr";
import SearchBar from "./components/SearchBar";
import TagPanel from "./components/TagPanel";
import ResultList from "./components/ResultList";
import Pagination from "./components/Pagination";
import SettingsModal from "./components/SettingsModal";

const PAGE_SIZE = 10;

export default function App() {
  const {
    bookmarks, loading, error,
    search, fetchTags, backup, getBackupDir, setBackupDir,
  } = useBkmr();

  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [settingsOpen, setSettingsOpen] = useState(false);

  // Auto-backup on startup if dir is configured
  useEffect(() => {
    getBackupDir().then((dir) => {
      if (dir) {
        backup(dir).catch(() => {});
      }
    });
  }, [getBackupDir, backup]);

  const handleSearch = useCallback((q: string) => {
    setQuery(q);
    setCurrentPage(1);
    search(q, selectedTags);
  }, [selectedTags, search]);

  // Re-search when tags change with the current query
  const handleTagsChange = useCallback((tags: string[]) => {
    setSelectedTags(tags);
    setCurrentPage(1);
    // If there's a pending query, use it; otherwise use current query
    search(query, tags);
  }, [query, search]);

  const paginatedBookmarks = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return bookmarks.slice(start, start + PAGE_SIZE);
  }, [bookmarks, currentPage]);

  const totalPages = Math.max(1, Math.ceil(bookmarks.length / PAGE_SIZE));

  return (
    <div className="h-screen flex flex-col bg-surface dark:bg-surface-dark text-text-primary dark:text-text-dark-primary">
      {/* Search bar area */}
      <div className="shrink-0 px-4 py-3 border-b border-border dark:border-border-dark">
        <SearchBar onSearch={handleSearch} loading={loading} />
      </div>

      {/* Main content area */}
      <div className="flex-1 flex overflow-hidden">
        {/* Tag sidebar */}
        <aside className="w-56 shrink-0 border-r border-border dark:border-border-dark bg-surface-sidebar dark:bg-surface-dark-sidebar p-3 flex flex-col">
          <TagPanel
            fetchTags={fetchTags}
            selectedTags={selectedTags}
            onTagsChange={handleTagsChange}
            onSearch={() => search(query, selectedTags)}
          />
          <div className="shrink-0 pt-2 mt-2 border-t border-border dark:border-border-dark">
            <button
              onClick={() => setSettingsOpen(true)}
              className="flex items-center gap-2 w-full px-2 py-1.5 text-sm text-text-secondary dark:text-text-dark-secondary hover:text-text-primary dark:hover:text-text-dark-primary rounded-card hover:bg-accent-bg dark:hover:bg-accent-dark-bg transition-colors"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
              </svg>
              设置
            </button>
          </div>
        </aside>

        {/* Results area */}
        <main className="flex-1 flex flex-col overflow-hidden">
          <div className="flex-1 overflow-y-auto p-3">
            <ResultList
              bookmarks={paginatedBookmarks}
              loading={loading}
              error={error}
            />
          </div>
          {bookmarks.length > 0 && (
            <div className="shrink-0 border-t border-border dark:border-border-dark">
              <Pagination
                currentPage={currentPage}
                totalPages={totalPages}
                onPageChange={setCurrentPage}
              />
            </div>
          )}
        </main>
      </div>

      <SettingsModal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        getBackupDir={getBackupDir}
        setBackupDir={setBackupDir}
        onBackupNow={backup}
      />
    </div>
  );
}
```

- [ ] **Step 9: Build full app and verify**

```bash
cd /Users/gyf/MyLib/bkmr-sync/bkmr-desktop
npx tauri build --ci 2>&1 | tail -30
```

Expected: Build succeeds. Verify by running:
```bash
npx tauri dev
```

Expected: Window opens with search bar, tag sidebar, empty result area.

- [ ] **Step 10: Quick sanity tests — verify known CLI behavior**

```bash
# Verify the HTTP server starts (run tauri dev in background, then curl)
cd /Users/gyf/MyLib/bkmr-sync/bkmr-desktop
npx tauri dev &
sleep 10
curl http://127.0.0.1:8733/api/docs 2>&1 | head -5
curl http://127.0.0.1:8733/api/tags 2>&1 | head -5
```

Expected: API docs HTML renders, tags JSON returns.

---

## Self-Review Checklist

### Spec Coverage
- Search UI (hsearch + tags): Task 2 (bkmr.rs + commands.rs) + Task 3 (SearchBar, TagPanel, App.tsx)
- Tag filter panel: Task 3 TagPanel
- Click to open in browser: Task 3 ResultList (uses Tauri shell:allow-open)
- HTTP GET /api/tags: Task 2 http_server.rs
- HTTP POST /api/bookmarks: Task 2 http_server.rs
- HTTP GET /api/docs: Task 2 http_server.rs + api_docs.html
- Auto-backup on start: Task 3 App.tsx useEffect
- Manual backup button: Task 3 SettingsModal
- Backup directory config: Task 2 commands.rs (get/set_backup_dir) + Task 3 SettingsModal
- Dark mode: Task 3 Tailwind dark: variants
- 10 per page pagination: Task 3 App.tsx + Pagination
- macOS native window: Task 1 Tauri config
- No tray/menubar: Task 1 Cargo.toml (no tray-icon feature)

### Placeholder Check
All steps contain executable code, not "TBD" or "implement later".

### Type Consistency
- `Bookmark` ↔ `BkmrBookmark`: same fields (id, url, title, tags, description, modified)
- `Tag` ↔ `BkmrTag`: same fields (name, count)
- Tauri commands in `main.rs` match function signatures in `commands.rs` ✓
- HTTP handler functions match Axum router paths ✓
