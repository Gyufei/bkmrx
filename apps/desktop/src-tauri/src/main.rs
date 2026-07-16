use std::sync::Mutex;

fn main() {
    let (shutdown_tx, shutdown_rx) = tokio::sync::oneshot::channel::<()>();
    let shutdown_tx = Mutex::new(Some(shutdown_tx));

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            let handle = app.handle().clone();
            tauri::async_runtime::spawn(
                bkmrx_lib::notes::set_app_handle(handle.clone());
            bkmrx_lib::http_server::start_server(handle, shutdown_rx)
            );
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            bkmrx_lib::commands::load_all_bookmarks,
            bkmrx_lib::commands::get_all_tags,
            bkmrx_lib::commands::backup_bookmarks,
            bkmrx_lib::commands::add_bookmark,
            bkmrx_lib::commands::delete_bookmarks,
            bkmrx_lib::commands::check_bookmark,
            bkmrx_lib::commands::show_bookmark,
            bkmrx_lib::commands::update_bookmark,
            bkmrx_lib::commands::scan_notes,
            bkmrx_lib::commands::read_note_file,
            bkmrx_lib::commands::write_note_file,
            bkmrx_lib::commands::create_note_file,
            bkmrx_lib::commands::delete_note,
            bkmrx_lib::commands::rename_note,
            bkmrx_lib::commands::get_settings,
            bkmrx_lib::commands::update_settings,
            bkmrx_lib::commands::get_server_status,
        ])
        .on_window_event(move |_window, event| {
            if let tauri::WindowEvent::CloseRequested { .. } = event {
                if let Some(tx) = shutdown_tx.lock().unwrap().take() {
                    let _ = tx.send(());
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running bkmrx");
}
