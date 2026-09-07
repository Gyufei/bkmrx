use std::{
    path::{Component, Path, PathBuf},
    sync::Arc,
};

use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

use super::{
    repository, watcher::NoteWatcher, NoteEvent, NotesWorkspaceListing, OpenedDocument,
    RenamedDocument, SavedDocument,
};
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

    pub fn open_document(&self, revision: u64, relative_path: &str) -> AppResult<OpenedDocument> {
        let path = self.authorize_existing(revision, relative_path)?;
        let content = repository::read(&path.to_string_lossy()).map_err(note_io_error)?;
        Ok(OpenedDocument {
            receipt: encode_receipt(&ReceiptPayload {
                format: 1,
                workspace_revision: revision,
                relative_path: relative_path.to_owned(),
                fingerprint: fingerprint(&content),
            })?,
            content,
        })
    }

    pub fn save_document(&self, receipt: &str, content: &str) -> AppResult<SavedDocument> {
        let receipt = decode_receipt(receipt)?;
        let (path, current) = self.authorize_receipt(&receipt)?;
        if !repository::write_if_unchanged(&path.to_string_lossy(), current.as_bytes(), content)
            .map_err(note_io_error)?
        {
            return Err(document_conflict());
        }
        Ok(SavedDocument {
            receipt: encode_receipt(&ReceiptPayload {
                fingerprint: fingerprint(content),
                ..receipt
            })?,
        })
    }

    pub fn rename_document(
        &self,
        receipt: &str,
        name: &str,
        pending_content: Option<&str>,
    ) -> AppResult<RenamedDocument> {
        validate_note_name(name)?;
        let mut receipt = decode_receipt(receipt)?;
        let (old_path, current) = self.authorize_receipt(&receipt)?;
        let new_path = old_path.parent().ok_or_else(path_outside_root)?.join(name);
        repository::ensure_rename_target_available(&new_path.to_string_lossy())
            .map_err(note_io_error)?;
        let content = pending_content.unwrap_or(&current);
        if pending_content.is_some()
            && !repository::write_if_unchanged(
                &old_path.to_string_lossy(),
                current.as_bytes(),
                content,
            )
            .map_err(note_io_error)?
        {
            return Err(document_conflict());
        }
        repository::rename(&old_path.to_string_lossy(), &new_path.to_string_lossy())
            .map_err(note_io_error)?;
        let (_, root) = self.root_at(receipt.workspace_revision)?;
        receipt.relative_path = relative_identity(&root, &new_path)?;
        receipt.fingerprint = fingerprint(content);
        Ok(RenamedDocument {
            relative_path: receipt.relative_path.clone(),
            receipt: encode_receipt(&receipt)?,
        })
    }

    pub fn delete_document(&self, receipt: &str) -> AppResult<()> {
        let receipt = decode_receipt(receipt)?;
        let (path, _) = self.authorize_receipt(&receipt)?;
        repository::delete(&path.to_string_lossy()).map_err(note_io_error)
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

    fn authorize_receipt(&self, receipt: &ReceiptPayload) -> AppResult<(PathBuf, String)> {
        let path = self.authorize_existing(receipt.workspace_revision, &receipt.relative_path)?;
        let current = repository::read(&path.to_string_lossy()).map_err(note_io_error)?;
        if fingerprint(&current) != receipt.fingerprint {
            return Err(document_conflict());
        }
        Ok((path, current))
    }
}

#[derive(Debug, Serialize, Deserialize)]
struct ReceiptPayload {
    format: u8,
    workspace_revision: u64,
    relative_path: String,
    fingerprint: String,
}

fn fingerprint(content: &str) -> String {
    format!("{:x}", Sha256::digest(content.as_bytes()))
}

fn encode_receipt(receipt: &ReceiptPayload) -> AppResult<String> {
    let serialized = serde_json::to_vec(receipt).map_err(|error| {
        AppError::internal_error(format!("failed to encode note receipt: {error}"))
    })?;
    Ok(URL_SAFE_NO_PAD.encode(serialized))
}

fn decode_receipt(receipt: &str) -> AppResult<ReceiptPayload> {
    let bytes = URL_SAFE_NO_PAD
        .decode(receipt)
        .map_err(|_| invalid_receipt())?;
    let decoded: ReceiptPayload = serde_json::from_slice(&bytes).map_err(|_| invalid_receipt())?;
    if decoded.format != 1 {
        return Err(invalid_receipt());
    }
    Ok(decoded)
}

fn invalid_receipt() -> AppError {
    AppError::note_error(
        "invalid_note_document_receipt",
        "The note document receipt is invalid",
    )
}

fn document_conflict() -> AppError {
    AppError::note_error(
        "note_document_conflict",
        "The note was changed outside this document session",
    )
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
