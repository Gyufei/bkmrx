use std::{fs, io, io::Write, path::Path, time::UNIX_EPOCH};

use atomic_write_file::AtomicWriteFile;

use super::NoteFile;

pub fn scan_notes(dir: &str) -> io::Result<Vec<NoteFile>> {
    let root = Path::new(dir);
    if !root.exists() {
        return Err(io::Error::new(io::ErrorKind::NotFound, "目录不存在"));
    }
    let mut notes = Vec::new();
    scan_dir(root, root, &mut notes)?;
    notes.sort_by_key(|note| note.title.to_lowercase());
    Ok(notes)
}

fn scan_dir(root: &Path, current: &Path, notes: &mut Vec<NoteFile>) -> io::Result<()> {
    for entry in fs::read_dir(current)? {
        let entry = entry?;
        let file_type = entry.file_type()?;
        let path = entry.path();
        if file_type.is_dir() {
            scan_dir(root, &path, notes)?;
        } else if file_type.is_file() && path.extension().is_some_and(|extension| extension == "md")
        {
            if let Some(note) = scan_note(root, &path) {
                notes.push(note);
            }
        }
    }
    Ok(())
}

pub fn scan_note(root: &Path, path: &Path) -> Option<NoteFile> {
    let meta = fs::metadata(path).ok()?;
    let modified = meta
        .modified()
        .ok()
        .and_then(|time| time.duration_since(UNIX_EPOCH).ok())
        .map(|duration| duration.as_secs())
        .unwrap_or(0);
    Some(NoteFile {
        relative_path: path.strip_prefix(root).ok()?.to_string_lossy().into_owned(),
        title: path.file_stem()?.to_str()?.to_owned(),
        tags: Vec::new(),
        modified,
        size: meta.len(),
    })
}

pub fn delete(path: &str) -> io::Result<()> {
    fs::remove_file(path)
}

pub fn delete_folder(path: &str) -> io::Result<()> {
    fs::remove_dir_all(path)
}

pub fn rename(old_path: &str, new_path: &str) -> io::Result<()> {
    fs::hard_link(old_path, new_path)?;
    if let Err(error) = fs::remove_file(old_path) {
        let _ = fs::remove_file(new_path);
        return Err(error);
    }
    Ok(())
}

pub fn ensure_rename_target_available(new_path: &str) -> io::Result<()> {
    if Path::new(new_path).exists() {
        return Err(io::Error::new(io::ErrorKind::AlreadyExists, "文件已存在"));
    }
    Ok(())
}

pub fn read(path: &str) -> io::Result<String> {
    fs::read_to_string(path)
}

pub fn write_if_unchanged(path: &str, expected: &[u8], content: &str) -> io::Result<bool> {
    if fs::read(path)? != expected {
        return Ok(false);
    }
    let mut file = AtomicWriteFile::open(path)?;
    file.write_all(content.as_bytes())?;
    if fs::read(path)? != expected {
        return Ok(false);
    }
    file.commit()?;
    Ok(true)
}

pub fn create(dir: &str, name: &str) -> io::Result<String> {
    let file_name = if name.ends_with(".md") {
        name.to_owned()
    } else {
        format!("{name}.md")
    };
    let path = Path::new(dir).join(file_name);
    if path.exists() {
        return Err(io::Error::new(io::ErrorKind::AlreadyExists, "文件已存在"));
    }
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    let title = name.trim_end_matches(".md");
    fs::write(&path, format!("# {title}\n\n"))?;
    Ok(path.to_string_lossy().into_owned())
}
