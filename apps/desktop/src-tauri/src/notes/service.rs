use std::sync::Arc;

use crate::error::{AppError, AppResult};

use super::{repository, watcher::NoteWatcher, NoteEvent, NoteFile};

pub struct NoteService {
    watcher: Option<NoteWatcher>,
}

impl NoteService {
    pub fn new(emit: Arc<dyn Fn(NoteEvent) + Send + Sync>) -> Self {
        Self {
            watcher: Some(NoteWatcher::new(emit)),
        }
    }

    pub fn without_events() -> Self {
        Self { watcher: None }
    }

    pub fn scan(&self, dir: &str) -> AppResult<Vec<NoteFile>> {
        let notes = repository::scan_notes(dir).map_err(note_io_error)?;
        if let Some(watcher) = &self.watcher {
            watcher.watch(dir)?;
        }
        Ok(notes)
    }

    pub fn read(&self, path: &str) -> AppResult<String> {
        repository::read(path).map_err(note_io_error)
    }

    pub fn write(&self, path: &str, content: &str) -> AppResult<()> {
        repository::write(path, content).map_err(note_io_error)
    }

    pub fn create(&self, dir: &str, name: &str) -> AppResult<String> {
        repository::create(dir, name).map_err(note_io_error)
    }

    pub fn delete(&self, path: &str) -> AppResult<()> {
        repository::delete(path).map_err(note_io_error)
    }

    pub fn rename(&self, old_path: &str, new_path: &str) -> AppResult<()> {
        repository::rename(old_path, new_path).map_err(note_io_error)
    }

    pub fn stop(&self) {
        if let Some(watcher) = &self.watcher {
            watcher.stop();
        }
    }
}

pub type SharedNoteService = Arc<NoteService>;

fn note_io_error(error: std::io::Error) -> AppError {
    AppError::note_error("note_io_error", error.to_string())
}
