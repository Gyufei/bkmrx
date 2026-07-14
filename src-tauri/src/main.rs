use std::sync::Mutex;

fn main() {
    let (shutdown_tx, shutdown_rx) = tokio::sync::oneshot::channel::<()>();
    let shutdown_tx = Mutex::new(Some(shutdown_tx));

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .setup(|_app| {
            tauri::async_runtime::spawn(
                bkmr_desktop_lib::http_server::start_server(shutdown_rx)
            );
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            bkmr_desktop_lib::commands::load_all_bookmarks,
            bkmr_desktop_lib::commands::search_bookmarks,
            bkmr_desktop_lib::commands::get_all_tags,
            bkmr_desktop_lib::commands::backup_bookmarks,
            bkmr_desktop_lib::commands::scan_notes,
            bkmr_desktop_lib::commands::read_note_file,
            bkmr_desktop_lib::commands::write_note_file,
            bkmr_desktop_lib::commands::create_note_file,
            bkmr_desktop_lib::commands::get_settings,
            bkmr_desktop_lib::commands::update_settings,
            bkmr_desktop_lib::commands::get_server_status,
        ])
        .on_window_event(move |_window, event| {
            if let tauri::WindowEvent::CloseRequested { .. } = event {
                if let Some(tx) = shutdown_tx.lock().unwrap().take() {
                    let _ = tx.send(());
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running bkmr-desktop");
}
