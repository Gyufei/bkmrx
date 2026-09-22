mod model;
mod policy;
mod repository;
mod service;
mod watcher;

pub use model::{
    DocumentReceipt, FolderDeletionSummary, NotesWorkspaceChangedEvent, NotesWorkspaceListing,
    OpenedDocument, OpenedHtmlDocument, RenamedDocument, SavedDocument, WorkspaceDirectory,
    WorkspaceFile, WorkspaceFileCapabilities, WorkspaceFileKind, WorkspaceFilePrimaryInteraction,
};
pub use policy::{WorkspaceFileOperation, WorkspaceFilePolicy};
pub use service::{NotesWorkspace, SharedNotesWorkspace};
pub use watcher::NoteEvent;
