use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
pub struct NoteFile {
    pub path: String,
    pub relative_path: String,
    pub title: String,
    pub tags: Vec<String>,
    pub modified: u64,
    pub size: u64,
}
