use serde::Serialize;
use std::fs;
use std::path::Path;
use std::time::UNIX_EPOCH;

#[derive(Debug, Clone, Serialize)]
pub struct NoteFile {
    pub path: String,
    pub relative_path: String,
    pub title: String,
    pub tags: Vec<String>,
    pub modified: u64,
    pub size: u64,
}

pub fn scan_notes(dir: &str) -> Result<Vec<NoteFile>, String> {
    let root = Path::new(dir);
    if !root.exists() {
        return Err("目录不存在".into());
    }
    let mut notes = Vec::new();
    scan_dir(root, root, &mut notes)?;
    notes.sort_by(|a, b| b.modified.cmp(&a.modified));
    Ok(notes)
}

fn scan_dir(root: &Path, current: &Path, notes: &mut Vec<NoteFile>) -> Result<(), String> {
    let entries = fs::read_dir(current).map_err(|e| e.to_string())?;
    for entry in entries {
        let entry = entry.map_err(|e| e.to_string())?;
        let path = entry.path();
        if path.is_dir() {
            scan_dir(root, &path, notes)?;
        } else if path.extension().map_or(false, |e| e == "md") {
            let meta = fs::metadata(&path).map_err(|e| e.to_string())?;
            let modified = meta
                .modified()
                .ok()
                .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
                .map(|d| d.as_secs())
                .unwrap_or(0);

            let content = fs::read_to_string(&path).map_err(|e| e.to_string())?;
            let (title, tags) = parse_frontmatter(&content, &path);

            notes.push(NoteFile {
                path: path.to_string_lossy().to_string(),
                relative_path: path
                    .strip_prefix(root)
                    .unwrap()
                    .to_string_lossy()
                    .to_string(),
                title,
                tags,
                modified,
                size: meta.len(),
            });
        }
    }
    Ok(())
}

fn parse_frontmatter(content: &str, path: &Path) -> (String, Vec<String>) {
    let mut tags = Vec::new();
    let mut title_from_fm = None;

    if let Some(rest) = content.strip_prefix("---") {
        if let Some(end) = rest.find("---") {
            let block = &rest[..end];
            let mut in_tags_list = false;

            for line in block.lines() {
                let trimmed = line.trim();
                if let Some(val) = trimmed.strip_prefix("title:") {
                    title_from_fm = Some(val.trim().trim_matches('"').trim_matches('\'').to_string());
                }
                if let Some(val) = trimmed.strip_prefix("tags:") {
                    let val = val.trim();
                    if val.starts_with('[') {
                        // inline array: tags: [tag1, "tag 2"]
                        let inner = val
                            .trim_start_matches('[')
                            .trim_end_matches(']');
                        tags = inner
                            .split(',')
                            .map(|t| {
                                t.trim()
                                    .trim_matches('"')
                                    .trim_matches('\'')
                                    .to_string()
                            })
                            .filter(|t| !t.is_empty())
                            .collect();
                        in_tags_list = false;
                    } else if val.is_empty() {
                        in_tags_list = true;
                    } else {
                        // single tag: tags: tag1
                        tags.push(val.to_string());
                        in_tags_list = false;
                    }
                } else if in_tags_list && trimmed.starts_with('-') {
                    tags.push(trimmed.trim_start_matches('-').trim().to_string());
                }
            }
        }
    }

    let title = title_from_fm.unwrap_or_else(|| {
        path.file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or("Untitled")
            .to_string()
    });

    (title, tags)
}

pub fn read_note_file(path: &str) -> Result<String, String> {
    fs::read_to_string(path).map_err(|e| e.to_string())
}

pub fn write_note_file(path: &str, content: &str) -> Result<(), String> {
    fs::write(path, content).map_err(|e| e.to_string())
}

pub fn create_note_file(dir: &str, name: &str) -> Result<String, String> {
    let file_name = if name.ends_with(".md") { name.to_string() } else { format!("{}.md", name) };
    let path = std::path::Path::new(dir).join(&file_name);
    if path.exists() {
        return Err("文件已存在".to_string());
    }
    let title = name.trim_end_matches(".md");
    let content = format!("# {}\n\n", title);
    fs::write(&path, &content).map_err(|e| e.to_string())?;
    Ok(path.to_string_lossy().to_string())
}
