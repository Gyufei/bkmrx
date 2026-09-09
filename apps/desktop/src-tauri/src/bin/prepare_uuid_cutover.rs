use std::path::PathBuf;

use bkmrx_lib::database::cutover::create_verified_backup;

fn main() {
    if let Err(error) = run() {
        eprintln!("{}", error.message);
        std::process::exit(1);
    }
}

fn run() -> bkmrx_lib::error::AppResult<()> {
    let mut arguments = std::env::args_os().skip(1).map(PathBuf::from);
    let source = arguments.next().ok_or_else(usage_error)?;
    let backup = arguments.next().ok_or_else(usage_error)?;
    if arguments.next().is_some() {
        return Err(usage_error());
    }

    let report = create_verified_backup(source, backup)?;
    println!(
        "verified backup: {} ({} bytes)",
        report.path.display(),
        report.bytes
    );
    Ok(())
}

fn usage_error() -> bkmrx_lib::error::AppError {
    bkmrx_lib::error::AppError::validation_error(
        "Usage: prepare_uuid_cutover <source-database> <new-backup-path>",
    )
}
