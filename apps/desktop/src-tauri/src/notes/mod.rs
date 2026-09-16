mod model;
mod repository;
mod service;
mod watcher;

pub use model::{
    DocumentReceipt, FolderDeletionSummary, NoteFile, NotesWorkspaceChangedEvent,
    NotesWorkspaceListing, OpenedDocument, RenamedDocument, SavedDocument, WorkspaceDirectory,
    WorkspaceFile, WorkspaceFileKind,
};
pub use service::{NotesWorkspace, SharedNotesWorkspace};
pub use watcher::NoteEvent;
