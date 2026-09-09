use std::fs::OpenOptions;
use std::path::{Path, PathBuf};
use std::time::Duration;

use rusqlite::backup::Backup;
use rusqlite::{Connection, OpenFlags};

use crate::error::{AppError, AppResult};

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct VerifiedBackup {
    pub path: PathBuf,
    pub bytes: u64,
}

pub fn create_verified_backup(
    source_path: impl AsRef<Path>,
    backup_path: impl AsRef<Path>,
) -> AppResult<VerifiedBackup> {
    let source_path = source_path.as_ref();
    let backup_path = backup_path.as_ref();
    validate_paths(source_path, backup_path)?;

    if let Some(parent) = backup_path.parent() {
        std::fs::create_dir_all(parent).map_err(cutover_error)?;
    }
    OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(backup_path)
        .map_err(cutover_error)?;

    let result = backup_and_verify(source_path, backup_path);
    if result.is_err() {
        let _ = std::fs::remove_file(backup_path);
    }
    result
}

fn validate_paths(source_path: &Path, backup_path: &Path) -> AppResult<()> {
    if !source_path.is_file() {
        return Err(AppError::validation_error(
            "The source database must be an existing file",
        ));
    }
    if source_path == backup_path {
        return Err(AppError::validation_error(
            "The backup path must differ from the source database",
        ));
    }
    if backup_path.exists() {
        return Err(AppError::validation_error("The backup path already exists"));
    }
    Ok(())
}

fn backup_and_verify(source_path: &Path, backup_path: &Path) -> AppResult<VerifiedBackup> {
    let source = Connection::open_with_flags(source_path, OpenFlags::SQLITE_OPEN_READ_ONLY)
        .map_err(cutover_error)?;
    let mut destination = Connection::open(backup_path).map_err(cutover_error)?;
    {
        let backup = Backup::new(&source, &mut destination).map_err(cutover_error)?;
        backup
            .run_to_completion(128, Duration::from_millis(10), None)
            .map_err(cutover_error)?;
    }
    drop(destination);

    verify_backup(backup_path)?;
    let bytes = std::fs::metadata(backup_path).map_err(cutover_error)?.len();
    Ok(VerifiedBackup {
        path: backup_path.to_owned(),
        bytes,
    })
}

fn verify_backup(path: &Path) -> AppResult<()> {
    let connection = Connection::open_with_flags(path, OpenFlags::SQLITE_OPEN_READ_ONLY)
        .map_err(cutover_error)?;
    let integrity: String = connection
        .query_row("PRAGMA integrity_check", [], |row| row.get(0))
        .map_err(cutover_error)?;
    let foreign_key_errors: i64 = connection
        .query_row("SELECT count(*) FROM pragma_foreign_key_check", [], |row| {
            row.get(0)
        })
        .map_err(cutover_error)?;
    if integrity != "ok" || foreign_key_errors != 0 {
        return Err(AppError::database_error(
            "The database backup failed integrity verification",
        ));
    }
    Ok(())
}

fn cutover_error(error: impl std::fmt::Display) -> AppError {
    AppError::database_error(format!("UUID cutover backup failed: {error}"))
}

#[cfg(test)]
mod tests {
    use super::create_verified_backup;
    use rusqlite::Connection;
    use tempfile::tempdir;

    #[test]
    fn creates_a_consistent_backup_of_a_legacy_database() {
        let directory = tempdir().unwrap();
        let source_path = directory.path().join("legacy.db");
        let backup_path = directory.path().join("backup/legacy.db");
        let source = Connection::open(&source_path).unwrap();
        source
            .execute_batch(include_str!("../../tests/fixtures/legacy_v1.sql"))
            .unwrap();
        drop(source);

        let report = create_verified_backup(&source_path, &backup_path).unwrap();
        let backup =
            Connection::open_with_flags(&report.path, rusqlite::OpenFlags::SQLITE_OPEN_READ_ONLY)
                .unwrap();

        assert!(report.bytes > 0);
        assert_eq!(
            backup
                .query_row("SELECT title FROM bookmarks", [], |row| row
                    .get::<_, String>(0))
                .unwrap(),
            "Example"
        );
        assert_eq!(
            backup
                .query_row("PRAGMA integrity_check", [], |row| row.get::<_, String>(0))
                .unwrap(),
            "ok"
        );
    }

    #[test]
    fn refuses_to_overwrite_an_existing_backup() {
        let directory = tempdir().unwrap();
        let source_path = directory.path().join("legacy.db");
        let backup_path = directory.path().join("backup.db");
        Connection::open(&source_path).unwrap();
        std::fs::write(&backup_path, "keep me").unwrap();

        let error = create_verified_backup(&source_path, &backup_path).unwrap_err();

        assert_eq!(error.code(), "validation_error");
        assert_eq!(std::fs::read_to_string(backup_path).unwrap(), "keep me");
    }

    #[test]
    fn removes_an_incomplete_backup_when_sqlite_backup_fails() {
        let directory = tempdir().unwrap();
        let source_path = directory.path().join("invalid.db");
        let backup_path = directory.path().join("backup.db");
        std::fs::write(&source_path, "not a sqlite database").unwrap();

        let error = create_verified_backup(&source_path, &backup_path).unwrap_err();

        assert_eq!(error.code(), "database_error");
        assert!(!backup_path.exists());
    }
}
