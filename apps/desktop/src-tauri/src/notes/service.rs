use std::{
    path::{Component, Path, PathBuf},
    sync::{Arc, Mutex},
};

use crate::error::{AppError, AppResult};

use super::{repository, watcher::NoteWatcher, NoteEvent, NoteFile};

pub struct NoteService {
    watcher: Option<NoteWatcher>,
    root: Mutex<Option<PathBuf>>,
}

impl NoteService {
    pub fn new(emit: Arc<dyn Fn(NoteEvent) + Send + Sync>) -> Self {
        Self {
            watcher: Some(NoteWatcher::new(emit)),
            root: Mutex::new(None),
        }
    }

    pub fn without_events() -> Self {
        Self {
            watcher: None,
            root: Mutex::new(None),
        }
    }

    pub fn scan(&self, dir: &str) -> AppResult<Vec<NoteFile>> {
        let root = Path::new(dir).canonicalize().map_err(note_io_error)?;
        if !root.is_dir() {
            return Err(note_io_error(std::io::Error::new(
                std::io::ErrorKind::NotFound,
                "目录不存在",
            )));
        }
        let root_str = root.to_string_lossy();
        let notes = repository::scan_notes(&root_str).map_err(note_io_error)?;
        if let Some(watcher) = &self.watcher {
            watcher.watch(&root_str)?;
        }
        *self.root.lock().map_err(|_| root_lock_error())? = Some(root);
        Ok(notes)
    }

    pub fn read(&self, path: &str) -> AppResult<String> {
        let path = self.authorize_existing(path)?;
        repository::read(&path.to_string_lossy()).map_err(note_io_error)
    }

    pub fn write(&self, path: &str, content: &str) -> AppResult<()> {
        let path = self.authorize_existing(path)?;
        repository::write(&path.to_string_lossy(), content).map_err(note_io_error)
    }

    pub fn create(&self, dir: &str, name: &str) -> AppResult<String> {
        validate_note_name(name)?;
        let dir = self.authorize_existing(dir)?;
        if !dir.is_dir() {
            return Err(path_outside_root());
        }
        repository::create(&dir.to_string_lossy(), name).map_err(note_io_error)
    }

    pub fn delete(&self, path: &str) -> AppResult<()> {
        let path = self.authorize_existing(path)?;
        repository::delete(&path.to_string_lossy()).map_err(note_io_error)
    }

    pub fn rename(&self, old_path: &str, new_path: &str) -> AppResult<()> {
        let old_path = self.authorize_existing(old_path)?;
        let new_path = Path::new(new_path);
        let parent = new_path.parent().ok_or_else(path_outside_root)?;
        let parent = self.authorize_existing(&parent.to_string_lossy())?;
        let file_name = new_path.file_name().ok_or_else(path_outside_root)?;
        let new_path = parent.join(file_name);
        repository::rename(&old_path.to_string_lossy(), &new_path.to_string_lossy())
            .map_err(note_io_error)
    }

    pub fn stop(&self) {
        if let Some(watcher) = &self.watcher {
            watcher.stop();
        }
    }

    fn authorize_existing(&self, path: &str) -> AppResult<PathBuf> {
        let root = self
            .root
            .lock()
            .map_err(|_| root_lock_error())?
            .clone()
            .ok_or_else(|| {
                AppError::note_error("notes_root_unset", "Scan a notes directory first")
            })?;
        let path = Path::new(path).canonicalize().map_err(note_io_error)?;
        if !path.starts_with(&root) {
            return Err(path_outside_root());
        }
        Ok(path)
    }
}

pub type SharedNoteService = Arc<NoteService>;

fn note_io_error(error: std::io::Error) -> AppError {
    AppError::note_error("note_io_error", error.to_string())
}

fn validate_note_name(name: &str) -> AppResult<()> {
    let mut components = Path::new(name).components();
    let is_single_component =
        matches!(components.next(), Some(Component::Normal(_))) && components.next().is_none();
    if name.is_empty()
        || name == "."
        || name == ".."
        || name.contains(['/', '\\', '\0'])
        || !is_single_component
    {
        return Err(AppError::note_error(
            "invalid_note_name",
            "Note name must not contain path separators",
        ));
    }
    Ok(())
}

fn path_outside_root() -> AppError {
    AppError::note_error(
        "note_path_outside_root",
        "Note path must stay within the selected notes directory",
    )
}

fn root_lock_error() -> AppError {
    AppError::internal_error("notes root lock is poisoned")
}
