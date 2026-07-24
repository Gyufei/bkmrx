use std::{
    path::{Path, PathBuf},
    sync::{Arc, Mutex},
};

use notify::{Config, EventKind, RecommendedWatcher, RecursiveMode, Watcher};

use crate::error::{AppError, AppResult};

use super::{repository::scan_note, NoteFile};

#[derive(Debug, Clone)]
pub enum NoteEvent {
    Changed(NoteFile),
    Removed(String),
}

type EventSink = Arc<dyn Fn(NoteEvent) + Send + Sync>;

pub struct NoteWatcher {
    current: Mutex<Option<(PathBuf, RecommendedWatcher)>>,
    emit: EventSink,
}

impl NoteWatcher {
    pub fn new(emit: EventSink) -> Self {
        Self {
            current: Mutex::new(None),
            emit,
        }
    }

    pub fn watch(&self, dir: &str) -> AppResult<()> {
        let root = PathBuf::from(dir);
        let mut current = self.current.lock().unwrap_or_else(|error| error.into_inner());
        if current
            .as_ref()
            .is_some_and(|(watched_dir, _)| watched_dir == &root)
        {
            return Ok(());
        }

        let event_root = root.clone();
        let emit = Arc::clone(&self.emit);
        let mut watcher = RecommendedWatcher::new(
            move |result: notify::Result<notify::Event>| {
                let Ok(event) = result else {
                    return;
                };
                for path in event.paths {
                    if path.extension().is_none_or(|extension| extension != "md") {
                        continue;
                    }
                    if matches!(event.kind, EventKind::Create(_) | EventKind::Modify(_)) {
                        if let Some(note) = scan_note(&event_root, &path) {
                            emit(NoteEvent::Changed(note));
                        }
                    } else if matches!(event.kind, EventKind::Remove(_)) {
                        emit(NoteEvent::Removed(path.to_string_lossy().into_owned()));
                    }
                }
            },
            Config::default(),
        )
        .map_err(watcher_error)?;
        watcher
            .watch(Path::new(dir), RecursiveMode::Recursive)
            .map_err(watcher_error)?;
        *current = Some((root, watcher));
        Ok(())
    }

    pub fn stop(&self) {
        *self.current.lock().unwrap_or_else(|error| error.into_inner()) = None;
    }
}

fn watcher_error(error: notify::Error) -> AppError {
    AppError::note_error("note_watcher_error", error.to_string())
}
