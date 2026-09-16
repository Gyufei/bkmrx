use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
pub struct NoteFile {
    pub relative_path: String,
    pub title: String,
    pub tags: Vec<String>,
    pub modified: u64,
    pub size: u64,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum WorkspaceFileKind {
    Markdown,
    External,
}

#[derive(Debug, Clone, Serialize)]
pub struct WorkspaceFile {
    pub name: String,
    pub relative_path: String,
    pub kind: WorkspaceFileKind,
}

#[derive(Debug, Clone, Serialize)]
pub struct WorkspaceDirectory {
    pub name: String,
    pub relative_path: String,
    pub directories: Vec<WorkspaceDirectory>,
    pub files: Vec<WorkspaceFile>,
}

#[derive(Debug, Clone, Serialize)]
pub struct NotesWorkspaceListing {
    pub revision: u64,
    pub notes: Vec<NoteFile>,
    pub root: WorkspaceDirectory,
}

#[derive(Debug, Clone, Serialize)]
pub struct NotesWorkspaceChangedEvent {
    pub revision: u64,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct FolderDeletionSummary {
    pub file_count: u64,
    pub directory_count: u64,
    pub invisible_entry_count: u64,
    pub receipt: String,
}

pub type DocumentReceipt = String;

#[derive(Debug, Clone, Serialize)]
pub struct OpenedDocument {
    pub content: String,
    pub receipt: DocumentReceipt,
}

#[derive(Debug, Clone, Serialize)]
pub struct SavedDocument {
    pub receipt: DocumentReceipt,
}

#[derive(Debug, Clone, Serialize)]
pub struct RenamedDocument {
    pub relative_path: String,
    pub receipt: DocumentReceipt,
}
