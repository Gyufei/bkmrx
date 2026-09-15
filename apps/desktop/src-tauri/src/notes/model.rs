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
pub struct NoteChangedEvent {
    pub revision: u64,
    pub note: NoteFile,
}

#[derive(Debug, Clone, Serialize)]
pub struct NoteRemovedEvent {
    pub revision: u64,
    pub relative_path: String,
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
