use std::{
    path::{Path, PathBuf},
    sync::{Arc, Mutex},
};

use notify::{Config, EventKind, RecommendedWatcher, RecursiveMode, Watcher};

use crate::{
    error::{AppError, AppResult},
    logging::sanitize_error,
};

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
        let mut current = self
            .current
            .lock()
            .unwrap_or_else(|error| error.into_inner());
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
                let event = match result {
                    Ok(event) => event,
                    Err(error) => {
                        log::warn!(
                            "note_watcher_event_failed error={:?}",
                            sanitize_error(&error.to_string())
                        );
                        return;
                    }
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
        log::info!("note_watcher_started");
        Ok(())
    }

    pub fn stop(&self) {
        *self
            .current
            .lock()
            .unwrap_or_else(|error| error.into_inner()) = None;
        log::info!("note_watcher_stopped");
    }
}

fn watcher_error(error: notify::Error) -> AppError {
    AppError::note_error("note_watcher_error", error.to_string())
}

#[cfg(test)]
mod tests {
    use super::NoteWatcher;
    use std::sync::Arc;

    #[test]
    fn missing_directory_returns_stable_watcher_error() {
        let watcher = NoteWatcher::new(Arc::new(|_| {}));

        let error = watcher
            .watch("/definitely/missing/bkmrx-notes-directory")
            .unwrap_err();

        assert_eq!(error.code(), "note_watcher_error");
    }
}
