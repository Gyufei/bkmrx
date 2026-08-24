use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::Path;

use crate::error::{AppError, AppResult};

pub(crate) fn write_atomically(destination: &Path, bytes: &[u8]) -> AppResult<()> {
    let directory = destination
        .parent()
        .ok_or_else(|| AppError::validation_error("export path has no parent directory"))?;
    fs::create_dir_all(directory).map_err(io_error)?;
    let base = destination
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("export");
    let timestamp = chrono::Utc::now().format("%Y%m%d-%H%M%S");
    let temporary = directory.join(format!(
        ".{base}-{timestamp}-{}-{}.tmp",
        std::process::id(),
        chrono::Utc::now().timestamp_nanos_opt().unwrap_or_default()
    ));

    let write_result = (|| -> AppResult<()> {
        let mut file = OpenOptions::new()
            .create_new(true)
            .write(true)
            .open(&temporary)
            .map_err(io_error)?;
        file.write_all(bytes).map_err(io_error)?;
        file.sync_all().map_err(io_error)?;
        fs::rename(&temporary, destination).map_err(io_error)
    })();
    if write_result.is_err() {
        if let Err(error) = fs::remove_file(&temporary) {
            eprintln!("Failed to clean up temporary export file: {error}");
        }
    }
    write_result
}

fn io_error(error: std::io::Error) -> AppError {
    eprintln!("Failed to write export file: {error}");
    AppError::export_write_failed()
}
