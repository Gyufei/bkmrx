use serde::Serialize;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, specta::Type)]
#[serde(rename_all = "snake_case")]
pub enum WorkspaceFileKind {
    Markdown,
    External,
}

#[derive(Debug, Clone, Serialize, specta::Type)]
pub struct WorkspaceFile {
    pub name: String,
    pub relative_path: String,
    pub kind: WorkspaceFileKind,
}

#[derive(Debug, Clone, Serialize, specta::Type)]
pub struct WorkspaceDirectory {
    pub name: String,
    pub relative_path: String,
    pub directories: Vec<WorkspaceDirectory>,
    pub files: Vec<WorkspaceFile>,
}

#[derive(Debug, Clone, Serialize, specta::Type)]
pub struct NotesWorkspaceListing {
    pub revision: u64,
    pub root: WorkspaceDirectory,
}

#[derive(Debug, Clone, Serialize)]
pub struct NotesWorkspaceChangedEvent {
    pub revision: u64,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, specta::Type)]
pub struct FolderDeletionSummary {
    pub file_count: u64,
    pub directory_count: u64,
    pub invisible_entry_count: u64,
    pub receipt: String,
}

pub type DocumentReceipt = String;

#[derive(Debug, Clone, Serialize, specta::Type)]
pub struct OpenedDocument {
    pub content: String,
    pub receipt: DocumentReceipt,
}

#[derive(Debug, Clone, Serialize, specta::Type)]
pub struct SavedDocument {
    pub receipt: DocumentReceipt,
}

#[derive(Debug, Clone, Serialize, specta::Type)]
pub struct RenamedDocument {
    pub relative_path: String,
    pub receipt: DocumentReceipt,
}
