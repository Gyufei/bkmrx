use std::{cmp::Ordering, collections::BTreeSet, fs, io, io::Write, path::Path};

#[cfg(not(unix))]
use std::time::UNIX_EPOCH;

use atomic_write_file::AtomicWriteFile;
use sha2::{Digest, Sha256};
use walkdir::{DirEntry, WalkDir};

use super::{WorkspaceDirectory, WorkspaceFile, WorkspaceFilePolicy};

pub fn scan_workspace(root: &Path) -> io::Result<WorkspaceDirectory> {
    if !root.exists() {
        return Err(io::Error::new(io::ErrorKind::NotFound, "目录不存在"));
    }
    scan_directory(root, root)
}

fn scan_directory(root: &Path, current: &Path) -> io::Result<WorkspaceDirectory> {
    let mut directories = Vec::new();
    let mut files = Vec::new();

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
            directories.push(scan_directory(root, entry.path())?);
        } else if file_type.is_file() {
            let relative_path = relative_identity(root, entry.path())?;
            let policy = WorkspaceFilePolicy::for_path(entry.path());
            files.push(WorkspaceFile {
                name,
                relative_path,
                kind: policy.kind(),
                capabilities: policy.capabilities(),
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

    Ok(WorkspaceDirectory {
        name: directory_name(current)?,
        relative_path: relative_identity(root, current)?,
        directories,
        files,
    })
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

pub fn preflight_folder_deletion(path: &Path) -> io::Result<(u64, u64, u64, String)> {
    let entries = WalkDir::new(path)
        .min_depth(1)
        .follow_links(false)
        .into_iter()
        .map(|entry| deletion_entry(path, entry.map_err(walkdir_error)?))
        .collect::<io::Result<Vec<_>>>()?;
    let (file_count, directory_count, invisible_entry_count) =
        entries
            .iter()
            .fold((0, 0, 0), |(files, directories, invisible), entry| {
                (
                    files + u64::from(entry.is_file),
                    directories + u64::from(entry.is_directory),
                    invisible + u64::from(entry.hidden || (!entry.is_file && !entry.is_directory)),
                )
            });
    Ok((
        file_count,
        directory_count,
        invisible_entry_count,
        folder_tree_fingerprint(entries),
    ))
}

struct FolderDeletionEntry {
    is_file: bool,
    is_directory: bool,
    hidden: bool,
    identity: Vec<u8>,
}

fn deletion_entry(root: &Path, entry: DirEntry) -> io::Result<FolderDeletionEntry> {
    let relative = entry
        .path()
        .strip_prefix(root)
        .map_err(|_| io::Error::other("路径不在待删除文件夹中"))?;
    let hidden = relative.components().any(|component| {
        component
            .as_os_str()
            .to_str()
            .is_none_or(|name| name.starts_with('.'))
    });
    let file_type = entry.file_type();
    let kind = if file_type.is_file() {
        b'f'
    } else if file_type.is_dir() {
        b'd'
    } else if file_type.is_symlink() {
        b'l'
    } else {
        b'o'
    };
    Ok(FolderDeletionEntry {
        is_file: file_type.is_file(),
        is_directory: file_type.is_dir(),
        hidden,
        identity: [vec![kind, 0], path_identity_bytes(relative)].concat(),
    })
}

fn folder_tree_fingerprint(entries: Vec<FolderDeletionEntry>) -> String {
    let identities = entries
        .into_iter()
        .map(|entry| entry.identity)
        .collect::<BTreeSet<_>>();
    let fingerprint = identities
        .iter()
        .fold(Sha256::new(), |digest, identity| {
            digest
                .chain_update((identity.len() as u64).to_le_bytes())
                .chain_update(identity)
        })
        .finalize();
    format!("{fingerprint:x}")
}

#[cfg(unix)]
fn path_identity_bytes(path: &Path) -> Vec<u8> {
    use std::os::unix::ffi::OsStrExt;

    path.as_os_str().as_bytes().to_vec()
}

#[cfg(not(unix))]
fn path_identity_bytes(path: &Path) -> Vec<u8> {
    path.to_string_lossy().as_bytes().to_vec()
}

#[cfg(unix)]
pub fn directory_identity(path: &Path) -> io::Result<String> {
    use std::os::unix::fs::MetadataExt;

    let metadata = fs::symlink_metadata(path)?;
    if metadata.file_type().is_symlink() || !metadata.is_dir() {
        return Err(io::Error::new(
            io::ErrorKind::InvalidInput,
            "目标不是文件夹",
        ));
    }
    Ok(format!("{}:{}", metadata.dev(), metadata.ino()))
}

#[cfg(not(unix))]
pub fn directory_identity(path: &Path) -> io::Result<String> {
    let metadata = fs::symlink_metadata(path)?;
    if metadata.file_type().is_symlink() || !metadata.is_dir() {
        return Err(io::Error::new(
            io::ErrorKind::InvalidInput,
            "目标不是文件夹",
        ));
    }
    let created = metadata
        .created()?
        .duration_since(UNIX_EPOCH)
        .map_err(io::Error::other)?;
    Ok(format!("{}:{}", created.as_secs(), created.subsec_nanos()))
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
    fs::write(&path, format!("## {title}\n\n"))?;
    Ok(path.to_string_lossy().into_owned())
}
