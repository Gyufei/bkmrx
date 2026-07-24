use std::sync::{Arc, Mutex};

use bkmrx_lib::{
    bookmarks::{BookmarkService, SqliteBookmarkRepository, SqliteFtsSearch},
    database::Database,
};
use tauri::{Emitter, Manager};

fn main() {
    let (shutdown_tx, shutdown_rx) = tokio::sync::oneshot::channel::<()>();
    let shutdown_tx = Mutex::new(Some(shutdown_tx));

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let handle = app.handle().clone();
            let app_data_dir = app.path().app_data_dir()?;
            let database = Arc::new(Database::open(app_data_dir.join("bookmarks.db"))?);
            database.assert_fts5_trigram()?;
            let runtime_paths =
                bkmrx_lib::settings::RuntimePaths::new(app_data_dir, database.schema_version()?);

            let notify_handle = handle.clone();
            let service = Arc::new(
                BookmarkService::new(
                    SqliteBookmarkRepository::new(Arc::clone(&database)),
                    SqliteFtsSearch::new(database),
                )
                .with_change_notifier(Arc::new(move || {
                    let _ = notify_handle.emit("bookmarks-changed", ());
                })),
            );

            app.manage(Arc::clone(&service));
            app.manage(runtime_paths);
            let note_handle = handle.clone();
            let note_service = Arc::new(bkmrx_lib::notes::NoteService::new(Arc::new(
                move |event| match event {
                    bkmrx_lib::notes::NoteEvent::Changed(note) => {
                        let _ = note_handle.emit("note-changed", note);
                    }
                    bkmrx_lib::notes::NoteEvent::Removed(path) => {
                        let _ = note_handle.emit("note-removed", path);
                    }
                },
            )));
            app.manage(Arc::clone(&note_service));
            tauri::async_runtime::spawn(bkmrx_lib::http_server::start_server(service, shutdown_rx));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            bkmrx_lib::commands::query_bookmarks,
            bkmrx_lib::commands::create_bookmark,
            bkmrx_lib::commands::update_bookmark,
            bkmrx_lib::commands::delete_bookmarks,
            bkmrx_lib::commands::get_bookmark_by_url,
            bkmrx_lib::commands::get_tags,
            bkmrx_lib::commands::record_bookmark_access,
            bkmrx_lib::commands::export_bookmarks,
            bkmrx_lib::commands::preview_bookmark_import,
            bkmrx_lib::commands::apply_bookmark_import,
            bkmrx_lib::commands::scan_notes,
            bkmrx_lib::commands::read_note_file,
            bkmrx_lib::commands::write_note_file,
            bkmrx_lib::commands::create_note_file,
            bkmrx_lib::commands::delete_note,
            bkmrx_lib::commands::rename_note,
            bkmrx_lib::commands::get_settings,
            bkmrx_lib::commands::update_settings,
            bkmrx_lib::commands::get_server_status,
            bkmrx_lib::commands::get_system_info,
        ])
        .on_window_event(move |_window, event| {
            if let tauri::WindowEvent::CloseRequested { .. } = event {
                if let Some(service) = _window.try_state::<bkmrx_lib::notes::SharedNoteService>() {
                    service.stop();
                }
                if let Some(tx) = shutdown_tx
                    .lock()
                    .unwrap_or_else(|error| error.into_inner())
                    .take()
                {
                    let _ = tx.send(());
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running bkmrx");
}
