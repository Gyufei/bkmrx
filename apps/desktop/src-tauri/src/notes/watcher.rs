use std::{
    path::{Path, PathBuf},
    sync::{Arc, Mutex},
};

use notify::{Config, EventKind, RecommendedWatcher, RecursiveMode, Watcher};

use crate::{
    error::{AppError, AppResult},
    logging::sanitize_error,
};

use super::{repository::scan_note, NoteChangedEvent, NoteRemovedEvent};

#[derive(Debug, Clone)]
pub enum NoteEvent {
    Changed(NoteChangedEvent),
    Removed(NoteRemovedEvent),
}

type EventSink = Arc<dyn Fn(NoteEvent) + Send + Sync>;

pub struct NoteWatcher {
    current: Mutex<Option<(PathBuf, u64, RecommendedWatcher)>>,
    emit: EventSink,
}

impl NoteWatcher {
    pub fn new(emit: EventSink) -> Self {
        Self {
            current: Mutex::new(None),
            emit,
        }
    }

    pub fn watch(&self, root: &Path, revision: u64) -> AppResult<()> {
        let root = root.to_path_buf();
        let mut current = self
            .current
            .lock()
            .unwrap_or_else(|error| error.into_inner());
        if current
            .as_ref()
            .is_some_and(|(watched_dir, watched_revision, _)| {
                watched_dir == &root && *watched_revision == revision
            })
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
                            emit(NoteEvent::Changed(NoteChangedEvent { revision, note }));
                        }
                    } else if matches!(event.kind, EventKind::Remove(_)) {
                        if let Ok(relative_path) = path.strip_prefix(&event_root) {
                            emit(NoteEvent::Removed(NoteRemovedEvent {
                                revision,
                                relative_path: relative_path.to_string_lossy().replace('\\', "/"),
                            }));
                        }
                    }
                }
            },
            Config::default(),
        )
        .map_err(watcher_error)?;
        watcher
            .watch(&root, RecursiveMode::Recursive)
            .map_err(watcher_error)?;
        *current = Some((root, revision, watcher));
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
    use std::{path::Path, sync::Arc};

    #[test]
    fn missing_directory_returns_stable_watcher_error() {
        let watcher = NoteWatcher::new(Arc::new(|_| {}));

        let error = watcher
            .watch(Path::new("/definitely/missing/bkmrx-notes-directory"), 1)
            .unwrap_err();

        assert_eq!(error.code(), "note_watcher_error");
    }
}
