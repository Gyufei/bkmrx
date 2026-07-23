use std::path::PathBuf;

use bkmrx_lib::legacy_migration::{migrate, MigrationOptions};

fn main() {
    match parse_arguments().and_then(|options| migrate(&options)) {
        Ok(report) => {
            println!(
                "{}",
                serde_json::to_string_pretty(&report).expect("migration report must serialize")
            );
        }
        Err(error) => {
            eprintln!("{}: {}", error.code, error.message);
            std::process::exit(1);
        }
    }
}

fn parse_arguments() -> bkmrx_lib::bookmarks::AppResult<MigrationOptions> {
    let mut source = None;
    let mut target = None;
    let mut backup_dir = None;
    let mut arguments = std::env::args().skip(1);
    while let Some(argument) = arguments.next() {
        let value = arguments.next().ok_or_else(|| {
            bkmrx_lib::bookmarks::AppError::validation_error(format!(
                "Missing value for {argument}"
            ))
        })?;
        match argument.as_str() {
            "--source" => source = Some(PathBuf::from(value)),
            "--target" => target = Some(PathBuf::from(value)),
            "--backup-dir" => backup_dir = Some(PathBuf::from(value)),
            _ => {
                return Err(bkmrx_lib::bookmarks::AppError::validation_error(
                    "Usage: migrate_bkmr --source <legacy.db> --target <bookmarks.db> --backup-dir <directory>",
                ))
            }
        }
    }
    Ok(MigrationOptions {
        source: source.ok_or_else(|| {
            bkmrx_lib::bookmarks::AppError::validation_error("--source is required")
        })?,
        target: target.ok_or_else(|| {
            bkmrx_lib::bookmarks::AppError::validation_error("--target is required")
        })?,
        backup_dir: backup_dir.ok_or_else(|| {
            bkmrx_lib::bookmarks::AppError::validation_error("--backup-dir is required")
        })?,
        check_app_port: true,
    })
}
