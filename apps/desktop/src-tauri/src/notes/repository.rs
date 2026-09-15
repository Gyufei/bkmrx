use std::{cmp::Ordering, fs, io, io::Write, path::Path, time::UNIX_EPOCH};

use atomic_write_file::AtomicWriteFile;
use walkdir::{DirEntry, WalkDir};

use super::{NoteFile, WorkspaceDirectory, WorkspaceFile, WorkspaceFileKind};

pub struct ScannedWorkspace {
    pub notes: Vec<NoteFile>,
    pub root: WorkspaceDirectory,
}

pub fn scan_workspace(root: &Path) -> io::Result<ScannedWorkspace> {
    if !root.exists() {
        return Err(io::Error::new(io::ErrorKind::NotFound, "目录不存在"));
    }
    let (directory, mut notes) = scan_directory(root, root)?;
    notes.sort_by(|left, right| {
        compare_name(&left.title, &right.title)
            .then_with(|| left.relative_path.cmp(&right.relative_path))
    });
    Ok(ScannedWorkspace {
        notes,
        root: directory,
    })
}

fn scan_directory(root: &Path, current: &Path) -> io::Result<(WorkspaceDirectory, Vec<NoteFile>)> {
    let mut directories = Vec::new();
    let mut files = Vec::new();
    let mut notes = Vec::new();

    for entry in WalkDir::new(current)
        .min_depth(1)
        .max_depth(1)
        .follow_links(false)
    {
        let entry = entry.map_err(walkdir_error)?;
        let name = entry_name(&entry)?;
        if name.starts_with('.') {
            continue;
        }
        let file_type = entry.file_type();
        if file_type.is_dir() {
            let (directory, child_notes) = scan_directory(root, entry.path())?;
            directories.push(directory);
            notes.extend(child_notes);
        } else if file_type.is_file() {
            let metadata = entry.metadata().map_err(walkdir_error)?;
            let relative_path = relative_identity(root, entry.path())?;
            let kind = classify_file(entry.path());
            if kind == WorkspaceFileKind::Markdown {
                notes.push(note_from_metadata(
                    entry.path(),
                    relative_path.clone(),
                    &metadata,
                )?);
            }
            files.push(WorkspaceFile {
                name,
                relative_path,
                kind,
            });
        }
    }

    directories.sort_by(|left, right| {
        compare_entry(
            &left.name,
            &left.relative_path,
            &right.name,
            &right.relative_path,
        )
    });
    files.sort_by(|left, right| {
        compare_entry(
            &left.name,
            &left.relative_path,
            &right.name,
            &right.relative_path,
        )
    });

    Ok((
        WorkspaceDirectory {
            name: directory_name(current)?,
            relative_path: relative_identity(root, current)?,
            directories,
            files,
        },
        notes,
    ))
}

pub fn scan_note(root: &Path, path: &Path) -> Option<NoteFile> {
    let meta = fs::metadata(path).ok()?;
    let relative_path = relative_identity(root, path).ok()?;
    note_from_metadata(path, relative_path, &meta).ok()
}

fn note_from_metadata(
    path: &Path,
    relative_path: String,
    meta: &fs::Metadata,
) -> io::Result<NoteFile> {
    let modified = meta
        .modified()
        .ok()
        .and_then(|time| time.duration_since(UNIX_EPOCH).ok())
        .map(|duration| duration.as_secs())
        .unwrap_or(0);
    Ok(NoteFile {
        relative_path,
        title: path
            .file_stem()
            .and_then(|title| title.to_str())
            .ok_or_else(invalid_filename)?
            .to_owned(),
        tags: Vec::new(),
        modified,
        size: meta.len(),
    })
}

fn classify_file(path: &Path) -> WorkspaceFileKind {
    match path.extension().and_then(|extension| extension.to_str()) {
        Some(extension)
            if extension.eq_ignore_ascii_case("md")
                || extension.eq_ignore_ascii_case("markdown") =>
        {
            WorkspaceFileKind::Markdown
        }
        _ => WorkspaceFileKind::External,
    }
}

fn entry_name(entry: &DirEntry) -> io::Result<String> {
    entry
        .file_name()
        .to_str()
        .map(str::to_owned)
        .ok_or_else(invalid_filename)
}

fn directory_name(path: &Path) -> io::Result<String> {
    path.file_name()
        .unwrap_or(path.as_os_str())
        .to_str()
        .map(str::to_owned)
        .ok_or_else(invalid_filename)
}

fn relative_identity(root: &Path, path: &Path) -> io::Result<String> {
    path.strip_prefix(root)
        .map_err(|_| io::Error::other("路径不在笔记目录中"))?
        .to_str()
        .map(|relative| relative.replace('\\', "/"))
        .ok_or_else(invalid_filename)
}

fn compare_entry(left_name: &str, left_path: &str, right_name: &str, right_path: &str) -> Ordering {
    compare_name(left_name, right_name).then_with(|| left_path.cmp(right_path))
}

fn compare_name(left: &str, right: &str) -> Ordering {
    left.to_lowercase()
        .cmp(&right.to_lowercase())
        .then_with(|| left.cmp(right))
}

fn invalid_filename() -> io::Error {
    io::Error::new(io::ErrorKind::InvalidData, "存在不受支持的文件名")
}

fn walkdir_error(error: walkdir::Error) -> io::Error {
    match error.io_error() {
        Some(source) => io::Error::new(source.kind(), source.to_string()),
        None => io::Error::other("无法读取笔记目录"),
    }
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
