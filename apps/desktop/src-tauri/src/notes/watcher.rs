use std::{
    path::{Component, Path, PathBuf},
    sync::{mpsc, Arc, Mutex},
    thread,
    time::{Duration, Instant},
};

use notify::{
    event::ModifyKind, Config, Event, EventKind, RecommendedWatcher, RecursiveMode, Watcher,
};

use crate::{
    error::{AppError, AppResult},
    logging::sanitize_error,
};

use super::NotesWorkspaceChangedEvent;

const TRAILING_DELAY: Duration = Duration::from_millis(250);
const MAXIMUM_DELAY: Duration = Duration::from_secs(2);

#[derive(Debug, Clone)]
pub enum NoteEvent {
    WorkspaceChanged(NotesWorkspaceChangedEvent),
}

type EventSink = Arc<dyn Fn(NoteEvent) + Send + Sync>;

pub struct NoteWatcher {
    current: Mutex<Option<ActiveWatch>>,
    emit: EventSink,
}

struct ActiveWatch {
    root: PathBuf,
    revision: u64,
    watcher: RecommendedWatcher,
    commands: mpsc::Sender<BatchCommand>,
    worker: thread::JoinHandle<()>,
}

enum BatchCommand {
    StructuralChange,
    Stop,
}

#[derive(Debug, Clone, Copy)]
struct RefreshBatch {
    first_event: Instant,
    last_event: Instant,
}

impl RefreshBatch {
    fn new(now: Instant) -> Self {
        Self {
            first_event: now,
            last_event: now,
        }
    }

    fn record(&mut self, now: Instant) {
        self.last_event = now;
    }

    fn deadline(self) -> Instant {
        (self.last_event + TRAILING_DELAY).min(self.first_event + MAXIMUM_DELAY)
    }
}

impl ActiveWatch {
    fn stop(self) {
        let _ = self.commands.send(BatchCommand::Stop);
        drop(self.watcher);
        let _ = self.worker.join();
    }
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
            .is_some_and(|active| active.root == root && active.revision == revision)
        {
            return Ok(());
        }

        if let Some(active) = current.take() {
            active.stop();
        }
        let (commands, receiver) = mpsc::channel();
        let event_commands = commands.clone();
        let event_root = root.clone();
        let mut watcher = RecommendedWatcher::new(
            move |result: notify::Result<Event>| match result {
                Ok(event) if is_structural_event(&event_root, &event) => {
                    let _ = event_commands.send(BatchCommand::StructuralChange);
                }
                Ok(_) => {}
                Err(error) => log::warn!(
                    "note_watcher_event_failed error={:?}",
                    sanitize_error(&error.to_string())
                ),
            },
            Config::default(),
        )
        .map_err(watcher_error)?;
        watcher
            .watch(&root, RecursiveMode::Recursive)
            .map_err(watcher_error)?;
        let emit = Arc::clone(&self.emit);
        let worker = thread::spawn(move || run_batcher(receiver, revision, emit));
        *current = Some(ActiveWatch {
            root,
            revision,
            watcher,
            commands,
            worker,
        });
        log::info!("note_watcher_started");
        Ok(())
    }

    pub fn stop(&self) {
        if let Some(active) = self
            .current
            .lock()
            .unwrap_or_else(|error| error.into_inner())
            .take()
        {
            active.stop();
        }
        log::info!("note_watcher_stopped");
    }
}

impl Drop for NoteWatcher {
    fn drop(&mut self) {
        if let Some(active) = self
            .current
            .get_mut()
            .unwrap_or_else(|error| error.into_inner())
            .take()
        {
            active.stop();
        }
    }
}

fn run_batcher(receiver: mpsc::Receiver<BatchCommand>, revision: u64, emit: EventSink) {
    let mut batch: Option<RefreshBatch> = None;
    loop {
        let command = match batch {
            None => receiver
                .recv()
                .map_err(|_| mpsc::RecvTimeoutError::Disconnected),
            Some(window) => {
                receiver.recv_timeout(window.deadline().saturating_duration_since(Instant::now()))
            }
        };
        match command {
            Ok(BatchCommand::StructuralChange) => {
                let now = Instant::now();
                if record_structural_change(&mut batch, now) {
                    emit(NoteEvent::WorkspaceChanged(NotesWorkspaceChangedEvent {
                        revision,
                    }));
                }
            }
            Ok(BatchCommand::Stop) | Err(mpsc::RecvTimeoutError::Disconnected) => return,
            Err(mpsc::RecvTimeoutError::Timeout) => {
                emit(NoteEvent::WorkspaceChanged(NotesWorkspaceChangedEvent {
                    revision,
                }));
                batch = None;
            }
        }
    }
}

fn record_structural_change(batch: &mut Option<RefreshBatch>, now: Instant) -> bool {
    match batch {
        Some(window) if now >= window.deadline() => {
            *batch = Some(RefreshBatch::new(now));
            true
        }
        Some(window) => {
            window.record(now);
            false
        }
        None => {
            *batch = Some(RefreshBatch::new(now));
            false
        }
    }
}

fn is_structural_event(root: &Path, event: &Event) -> bool {
    if event.need_rescan() {
        return true;
    }

    let structural_kind = matches!(
        event.kind,
        EventKind::Create(_) | EventKind::Remove(_) | EventKind::Modify(ModifyKind::Name(_))
    );
    structural_kind
        && event
            .paths
            .iter()
            .any(|path| is_visible_workspace_path(root, path))
}

fn is_visible_workspace_path(root: &Path, path: &Path) -> bool {
    path.strip_prefix(root).is_ok_and(|relative| {
        relative.components().all(|component| match component {
            Component::Normal(name) => !name.to_string_lossy().starts_with('.'),
            _ => false,
        })
    })
}

fn watcher_error(error: notify::Error) -> AppError {
    AppError::note_error("note_watcher_error", error.to_string())
}

#[cfg(test)]
mod tests {
    use std::{
        path::Path,
        sync::{mpsc, Arc},
        thread,
        time::{Duration, Instant},
    };

    use notify::{
        event::{CreateKind, DataChange, Flag, ModifyKind, RemoveKind, RenameMode},
        Event, EventKind,
    };

    use super::{
        is_structural_event, record_structural_change, run_batcher, BatchCommand, NoteEvent,
        NoteWatcher, RefreshBatch, MAXIMUM_DELAY, TRAILING_DELAY,
    };

    fn event(kind: EventKind, path: &str) -> Event {
        Event::new(kind).add_path(Path::new(path).to_path_buf())
    }

    #[test]
    fn missing_directory_returns_stable_watcher_error() {
        let watcher = NoteWatcher::new(Arc::new(|_| {}));
        let error = watcher
            .watch(Path::new("/definitely/missing/bkmrx-notes-directory"), 1)
            .unwrap_err();
        assert_eq!(error.code(), "note_watcher_error");
    }

    #[test]
    fn accepts_visible_structure_events_for_files_and_directories() {
        let root = Path::new("/notes");
        for candidate in [
            event(EventKind::Create(CreateKind::File), "/notes/page.html"),
            event(EventKind::Create(CreateKind::Folder), "/notes/folder"),
            event(EventKind::Remove(RemoveKind::Any), "/notes/data.json"),
            event(
                EventKind::Modify(ModifyKind::Name(RenameMode::Both)),
                "/notes/old.js",
            ),
        ] {
            assert!(is_structural_event(root, &candidate));
        }
    }

    #[test]
    fn accepts_rescan_requests_without_paths() {
        let candidate = Event::new(EventKind::Other).set_flag(Flag::Rescan);

        assert!(is_structural_event(Path::new("/notes"), &candidate));
    }

    #[test]
    fn ignores_content_changes_hidden_paths_and_paths_outside_workspace() {
        let root = Path::new("/notes");
        for candidate in [
            event(
                EventKind::Modify(ModifyKind::Data(DataChange::Content)),
                "/notes/note.md",
            ),
            event(EventKind::Create(CreateKind::File), "/notes/.secret.html"),
            event(
                EventKind::Create(CreateKind::File),
                "/notes/.private/page.html",
            ),
            event(EventKind::Create(CreateKind::File), "/outside/page.html"),
            event(EventKind::Any, "/notes/page.html"),
            event(EventKind::Other, "/notes/page.html"),
        ] {
            assert!(!is_structural_event(root, &candidate));
        }
    }

    #[test]
    fn batch_deadline_uses_trailing_delay_with_a_maximum_wait() {
        let start = Instant::now();
        let mut active = Some(RefreshBatch::new(start));
        assert_eq!(active.unwrap().deadline(), start + TRAILING_DELAY);
        assert!(!record_structural_change(
            &mut active,
            start + Duration::from_millis(100)
        ));
        assert_eq!(
            active.unwrap().deadline(),
            start + Duration::from_millis(350)
        );
        assert!(!record_structural_change(
            &mut active,
            start + Duration::from_millis(349)
        ));
        assert_eq!(
            active.unwrap().deadline(),
            start + Duration::from_millis(599)
        );
        for elapsed_millis in (500..2_000).step_by(200) {
            assert!(!record_structural_change(
                &mut active,
                start + Duration::from_millis(elapsed_millis)
            ));
        }
        assert!(!record_structural_change(
            &mut active,
            start + MAXIMUM_DELAY - Duration::from_millis(1)
        ));
        assert_eq!(active.unwrap().deadline(), start + MAXIMUM_DELAY);
        assert!(record_structural_change(&mut active, start + MAXIMUM_DELAY));
        assert_eq!(active.unwrap().first_event, start + MAXIMUM_DELAY);
    }

    #[test]
    fn event_burst_emits_one_workspace_refresh() {
        let (commands, receiver) = mpsc::channel();
        let (events, emitted) = mpsc::channel();
        let worker = thread::spawn(move || {
            run_batcher(
                receiver,
                7,
                Arc::new(move |event| {
                    let NoteEvent::WorkspaceChanged(change) = event;
                    events.send(change.revision).unwrap();
                }),
            );
        });

        commands.send(BatchCommand::StructuralChange).unwrap();
        commands.send(BatchCommand::StructuralChange).unwrap();
        commands.send(BatchCommand::StructuralChange).unwrap();

        assert_eq!(emitted.recv_timeout(Duration::from_secs(1)).unwrap(), 7);
        assert!(emitted.try_recv().is_err());
        commands.send(BatchCommand::Stop).unwrap();
        worker.join().unwrap();
    }
}
