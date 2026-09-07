use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
pub struct NoteFile {
    pub relative_path: String,
    pub title: String,
    pub tags: Vec<String>,
    pub modified: u64,
    pub size: u64,
}

#[derive(Debug, Clone, Serialize)]
pub struct NotesWorkspaceListing {
    pub revision: u64,
    pub notes: Vec<NoteFile>,
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
