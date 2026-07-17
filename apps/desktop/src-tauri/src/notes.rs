use serde::Serialize;
use std::fs;
use std::path::Path;
use std::sync::{Mutex, OnceLock};
use std::time::UNIX_EPOCH;
use notify::{EventKind, RecursiveMode, Watcher, RecommendedWatcher, Config};
use tauri::Emitter;

static APP_HANDLE: OnceLock<tauri::AppHandle> = OnceLock::new();
static WATCHER: OnceLock<Mutex<Option<RecommendedWatcher>>> = OnceLock::new();

pub fn set_app_handle(handle: tauri::AppHandle) {
    let _ = APP_HANDLE.set(handle);
}

pub fn stop_watcher() {
    if let Some(mtx) = WATCHER.get() {
        *mtx.lock().unwrap() = None;
    }
}

#[derive(Debug, Clone, Serialize)]
pub struct NoteFile {
    pub path: String,
    pub relative_path: String,
    pub title: String,
    pub tags: Vec<String>,
    pub modified: u64,
    pub size: u64,
}

fn scan_note(root: &Path, path: &Path) -> Option<NoteFile> {
    let meta = fs::metadata(path).ok()?;
    let modified = meta
        .modified()
        .ok()
        .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
        .map(|d| d.as_secs())
        .unwrap_or(0);
    Some(NoteFile {
        path: path.to_string_lossy().to_string(),
        relative_path: path.strip_prefix(root).ok()?.to_string_lossy().to_string(),
        title: path.file_stem()?.to_str()?.to_string(),
        tags: vec![],
        modified,
        size: meta.len(),
    })
}

pub fn scan_notes(dir: &str) -> Result<Vec<NoteFile>, String> {
    let root = Path::new(dir);
    if !root.exists() {
        return Err("目录不存在".into());
    }
    let mut notes = Vec::new();
    scan_dir(root, root, &mut notes)?;
    notes.sort_by(|a, b| b.modified.cmp(&a.modified));
    if let Some(handle) = APP_HANDLE.get() {
        start_watcher(dir, handle.clone());
    }
    Ok(notes)
}

fn scan_dir(root: &Path, current: &Path, notes: &mut Vec<NoteFile>) -> Result<(), String> {
    let entries = fs::read_dir(current).map_err(|e| e.to_string())?;
    for entry in entries {
        let entry = entry.map_err(|e| e.to_string())?;
        let path = entry.path();
        if path.is_dir() {
            scan_dir(root, &path, notes)?;
        } else if path.extension().map_or(false, |e| e == "md") {
            if let Some(note) = scan_note(root, &path) {
                notes.push(note);
            }
        }
    }
    Ok(())
}

fn start_watcher(dir: &str, app_handle: tauri::AppHandle) {
    let mtx = WATCHER.get_or_init(|| Mutex::new(None));
    let mut guard = mtx.lock().unwrap();
    if guard.is_some() {
        return;
    }
    let dir = dir.to_string();
    let root = Path::new(&dir).to_path_buf();
    let (tx, rx) = std::sync::mpsc::channel();

    let mut watcher = match RecommendedWatcher::new(tx, Config::default()) {
        Ok(w) => w,
        Err(e) => { eprintln!("Failed to create watcher: {e}"); return; }
    };

    if let Err(e) = watcher.watch(Path::new(&dir), RecursiveMode::Recursive) {
        eprintln!("Failed to watch directory: {e}"); return;
    }

    std::thread::spawn(move || {
        for res in rx {
            let event = match res {
                Ok(e) => e,
                Err(_) => break, // sender dropped → watcher stopped
            };
            for path in &event.paths {
                if path.extension().map_or(true, |e| e != "md") { continue; }
                let kind = event.kind;
                if matches!(kind, EventKind::Create(_) | EventKind::Modify(_)) {
                    if let Some(note) = scan_note(&root, path) {
                        let _ = app_handle.emit("note-changed", &note);
                    }
                } else if matches!(kind, EventKind::Remove(_)) {
                    let _ = app_handle.emit("note-removed", &path.to_string_lossy().to_string());
                }
            }
        }
    });

    *guard = Some(watcher);
}

pub fn delete_note_file(path: &str) -> Result<(), String> {
    fs::remove_file(path).map_err(|e| format!("删除失败: {e}"))
}

pub fn rename_note_file(old_path: &str, new_path: &str) -> Result<(), String> {
    fs::rename(old_path, new_path).map_err(|e| format!("重命名失败: {e}"))
}

pub fn read_note_file(path: &str) -> Result<String, String> {
    fs::read_to_string(path).map_err(|e| e.to_string())
}

pub fn write_note_file(path: &str, content: &str) -> Result<(), String> {
    fs::write(path, content).map_err(|e| e.to_string())
}

pub fn create_note_file(dir: &str, name: &str) -> Result<String, String> {
    let file_name = if name.ends_with(".md") { name.to_string() } else { format!("{}.md", name) };
    let path = std::path::Path::new(dir).join(&file_name);
    if path.exists() {
        return Err("文件已存在".to_string());
    }
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("创建目录失败: {e}"))?;
    }
    let title = name.trim_end_matches(".md");
    let content = format!("# {}\n\n", title);
    fs::write(&path, &content).map_err(|e| e.to_string())?;
    Ok(path.to_string_lossy().to_string())
}
