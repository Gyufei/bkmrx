use std::{
    path::{Component, Path, PathBuf},
    sync::Arc,
};

use super::{repository, watcher::NoteWatcher, NoteEvent, NotesWorkspaceListing};
use crate::{
    error::{AppError, AppResult},
    settings::SharedSettingsStore,
};

pub struct NotesWorkspace {
    settings: SharedSettingsStore,
    watcher: Option<NoteWatcher>,
}

impl NotesWorkspace {
    pub fn new(settings: SharedSettingsStore, emit: Arc<dyn Fn(NoteEvent) + Send + Sync>) -> Self {
        Self {
            settings,
            watcher: Some(NoteWatcher::new(emit)),
        }
    }

    pub fn list(&self) -> AppResult<NotesWorkspaceListing> {
        let (revision, root) = self.configured_root()?;
        let notes = repository::scan_notes(&root.to_string_lossy()).map_err(note_io_error)?;
        if let Some(watcher) = &self.watcher {
            watcher.watch(&root, revision)?;
        }
        Ok(NotesWorkspaceListing { revision, notes })
    }

    pub fn read(&self, revision: u64, relative_path: &str) -> AppResult<String> {
        let path = self.authorize_existing(revision, relative_path)?;
        repository::read(&path.to_string_lossy()).map_err(note_io_error)
    }

    pub fn write(&self, revision: u64, relative_path: &str, content: &str) -> AppResult<()> {
        let path = self.authorize_existing(revision, relative_path)?;
        repository::write(&path.to_string_lossy(), content).map_err(note_io_error)
    }

    pub fn create(&self, revision: u64, directory: &str, name: &str) -> AppResult<String> {
        validate_note_name(name)?;
        let dir = self.authorize_existing(revision, directory)?;
        if !dir.is_dir() {
            return Err(path_outside_root());
        }
        let created = repository::create(&dir.to_string_lossy(), name).map_err(note_io_error)?;
        let (_, root) = self.root_at(revision)?;
        relative_identity(&root, Path::new(&created))
    }

    pub fn delete(&self, revision: u64, relative_path: &str) -> AppResult<()> {
        let path = self.authorize_existing(revision, relative_path)?;
        repository::delete(&path.to_string_lossy()).map_err(note_io_error)
    }

    pub fn delete_folder(&self, revision: u64, relative_path: &str) -> AppResult<()> {
        if relative_path.is_empty() {
            return Err(path_outside_root());
        }
        let path = self.authorize_existing(revision, relative_path)?;
        if !path.is_dir() {
            return Err(path_outside_root());
        }
        repository::delete_folder(&path.to_string_lossy()).map_err(note_io_error)
    }

    pub fn rename(&self, revision: u64, relative_path: &str, name: &str) -> AppResult<String> {
        validate_note_name(name)?;
        let old_path = self.authorize_existing(revision, relative_path)?;
        let new_path = old_path.parent().ok_or_else(path_outside_root)?.join(name);
        repository::rename(&old_path.to_string_lossy(), &new_path.to_string_lossy())
            .map_err(note_io_error)?;
        let (_, root) = self.root_at(revision)?;
        relative_identity(&root, &new_path)
    }

    pub fn stop(&self) {
        if let Some(watcher) = &self.watcher {
            watcher.stop();
        }
    }

    fn configured_root(&self) -> AppResult<(u64, PathBuf)> {
        let (revision, configured) = self.settings.notes_workspace_configuration();
        let configured = configured
            .filter(|value| !value.trim().is_empty())
            .ok_or_else(|| {
                AppError::note_error(
                    "notes_workspace_unconfigured",
                    "Configure a notes directory first",
                )
            })?;
        let root = Path::new(&configured)
            .canonicalize()
            .map_err(note_io_error)?;
        if !root.is_dir() {
            return Err(path_outside_root());
        }
        Ok((revision, root))
    }

    fn root_at(&self, expected: u64) -> AppResult<(u64, PathBuf)> {
        let configured = self.configured_root()?;
        if configured.0 != expected {
            return Err(AppError::note_error(
                "notes_workspace_changed",
                "The notes workspace changed; refresh and try again",
            ));
        }
        Ok(configured)
    }

    fn authorize_existing(&self, revision: u64, relative_path: &str) -> AppResult<PathBuf> {
        validate_relative_path(relative_path)?;
        let (_, root) = self.root_at(revision)?;
        let path = root
            .join(relative_path)
            .canonicalize()
            .map_err(note_io_error)?;
        if !path.starts_with(&root) {
            return Err(path_outside_root());
        }
        Ok(path)
    }
}

pub type SharedNotesWorkspace = Arc<NotesWorkspace>;

fn relative_identity(root: &Path, path: &Path) -> AppResult<String> {
    path.strip_prefix(root)
        .map(|path| path.to_string_lossy().replace('\\', "/"))
        .map_err(|_| path_outside_root())
}

fn validate_relative_path(path: &str) -> AppResult<()> {
    if Path::new(path).is_absolute()
        || Path::new(path).components().any(|component| {
            matches!(
                component,
                Component::ParentDir | Component::RootDir | Component::Prefix(_)
            )
        })
    {
        return Err(path_outside_root());
    }
    Ok(())
}

fn note_io_error(error: std::io::Error) -> AppError {
    AppError::note_error("note_io_error", error.to_string())
}

fn validate_note_name(name: &str) -> AppResult<()> {
    let mut components = Path::new(name).components();
    let single =
        matches!(components.next(), Some(Component::Normal(_))) && components.next().is_none();
    if name.is_empty() || name == "." || name == ".." || name.contains(['/', '\\', '\0']) || !single
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
