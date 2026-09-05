use std::sync::Arc;

use bkmrx_lib::{
    bookmarks::{Bookmark, BookmarkEvents, BookmarkStore},
    database::Database,
    preview::PreviewService,
    rss::{RssRepository, RssService},
    todos::{SqliteTodoRepository, TodoService},
};
use tauri::{Emitter, Manager};
use tauri_plugin_dialog::{DialogExt, MessageDialogKind};

struct TauriBookmarkEvents {
    handle: tauri::AppHandle,
}

impl BookmarkEvents for TauriBookmarkEvents {
    fn changed(&self) {
        if let Err(error) = self.handle.emit("bookmarks-changed", ()) {
            log::warn!("frontend_event_emit_failed event=bookmarks-changed error={error}");
        }
    }

    fn accessed(&self, bookmark: &Bookmark) {
        if let Err(error) = self.handle.emit("bookmark-accessed", bookmark) {
            log::warn!("frontend_event_emit_failed event=bookmark-accessed error={error}");
        }
    }
}

fn is_allowed_app_navigation(url: &tauri::Url) -> bool {
    if url.scheme() == "tauri" && url.host_str() == Some("localhost") {
        return true;
    }
    if matches!(url.scheme(), "http" | "https") && url.host_str() == Some("tauri.localhost") {
        return true;
    }

    tauri::is_dev()
        && url.scheme() == "http"
        && url.host_str() == Some("localhost")
        && url.port() == Some(1420)
}

fn main() {
    tauri::Builder::default()
        .plugin(
            tauri::plugin::Builder::<tauri::Wry>::new("navigation-guard")
                .on_navigation(|_webview, url| is_allowed_app_navigation(url))
                .build(),
        )
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            bkmrx_lib::logging::initialize(app.handle());
            install_panic_hook();
            log::info!(
                "application_started version={} mode={} os={} arch={}",
                env!("CARGO_PKG_VERSION"),
                if cfg!(debug_assertions) {
                    "debug"
                } else {
                    "release"
                },
                std::env::consts::OS,
                std::env::consts::ARCH
            );
            let handle = app.handle().clone();
            let app_data_dir = app.path().app_data_dir()?;
            let database = Arc::new(Database::open(app_data_dir.join("bookmarks.db"))?);
            database.assert_fts5_trigram()?;
            let runtime_paths =
                bkmrx_lib::settings::RuntimePaths::new(app_data_dir, database.schema_version()?);

            let service = Arc::new(BookmarkStore::new(Arc::clone(&database)).with_events(
                Arc::new(TauriBookmarkEvents {
                    handle: handle.clone(),
                }),
            ));

            app.manage(Arc::clone(&service));
            app.manage(Arc::new(PreviewService::new(None)?));
            let todo_handle = handle.clone();
            let todo_service = Arc::new(
                TodoService::new(SqliteTodoRepository::new(Arc::clone(&database)))
                    .with_change_notifier(Arc::new(move || {
                        if let Err(error) = todo_handle.emit("todos-changed", ()) {
                            log::warn!(
                                "frontend_event_emit_failed event=todos-changed error={error}"
                            );
                        }
                    })),
            );
            app.manage(todo_service);
            let settings_path = runtime_paths.settings_path().to_path_buf();
            let http_client = reqwest::Client::builder()
                .timeout(std::time::Duration::from_secs(10))
                .build()?;
            let provider_context = bkmrx_lib::providers::ProviderContext::new(http_client);
            let translation_runtime =
                Arc::new(bkmrx_lib::translation::TranslationRuntime::default());
            let mut translation_registry = bkmrx_lib::translation::TranslationRegistry::default();
            translation_registry
                .register(Arc::new(
                    bkmrx_lib::translation::providers::NiuTransProviderFactory,
                ))
                .map_err(std::io::Error::other)?;
            let provider_manager =
                Arc::new(bkmrx_lib::translation::TranslationProviderManager::new(
                    translation_registry,
                    Arc::clone(&translation_runtime),
                    provider_context,
                ));
            let opened = bkmrx_lib::settings::SettingsStore::open(settings_path, provider_manager);
            if let Some(warning) = opened.warning {
                log::error!("settings_recovery_started error_code={}", warning.code,);
                handle
                    .dialog()
                    .message(warning.message)
                    .title("设置需要修复")
                    .kind(MessageDialogKind::Warning)
                    .show(|_| {});
            }
            let settings_store = Arc::new(opened.store);
            app.manage(Arc::new(
                RssService::new(RssRepository::new(Arc::clone(&database)))
                    .with_settings_store(Arc::clone(&settings_store)),
            ));
            let translation_service =
                bkmrx_lib::translation::TranslationService::new(translation_runtime);
            app.manage(settings_store);
            app.manage(runtime_paths);
            let note_handle = handle.clone();
            let note_service = Arc::new(bkmrx_lib::notes::NoteService::new(Arc::new(
                move |event| match event {
                    bkmrx_lib::notes::NoteEvent::Changed(note) => {
                        if let Err(error) = note_handle.emit("note-changed", note) {
                            log::warn!(
                                "frontend_event_emit_failed event=note-changed error={error}"
                            );
                        }
                    }
                    bkmrx_lib::notes::NoteEvent::Removed(path) => {
                        if let Err(error) = note_handle.emit("note-removed", path) {
                            log::warn!(
                                "frontend_event_emit_failed event=note-removed error={error}"
                            );
                        }
                    }
                },
            )));
            app.manage(Arc::clone(&note_service));
            let http_launch =
                tauri::async_runtime::block_on(bkmrx_lib::http_server::LocalHttpServer::launch(
                    bkmrx_lib::http_server::HttpServerOptions::default(),
                    bkmrx_lib::http_server::router_with_translation(service, translation_service),
                ));
            if let Some(warning) = http_launch.warning {
                log::error!("http_server_unavailable error_code={}", warning.code);
                handle
                    .dialog()
                    .message(warning.message)
                    .title("本地连接不可用")
                    .kind(MessageDialogKind::Warning)
                    .show(|_| {});
            }
            app.manage(http_launch.server);
            log::info!("application_initialized");
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
            bkmrx_lib::commands::set_bookmark_starred,
            bkmrx_lib::commands::prepare_bookmark_preview,
            bkmrx_lib::commands::preview_rss_feed,
            bkmrx_lib::commands::create_rss_feed,
            bkmrx_lib::commands::list_rss_feeds,
            bkmrx_lib::commands::list_rss_entries,
            bkmrx_lib::commands::refresh_rss_feed,
            bkmrx_lib::commands::refresh_all_rss_feeds,
            bkmrx_lib::commands::mark_rss_entry_read,
            bkmrx_lib::commands::rename_rss_feed,
            bkmrx_lib::commands::delete_rss_feed,
            bkmrx_lib::commands::download_rss_image,
            bkmrx_lib::commands::query_todos,
            bkmrx_lib::commands::get_todo_tags,
            bkmrx_lib::commands::create_todo,
            bkmrx_lib::commands::update_todo,
            bkmrx_lib::commands::set_todo_status,
            bkmrx_lib::commands::delete_todo,
            bkmrx_lib::commands::rename_todo_tag,
            bkmrx_lib::commands::delete_todo_tag,
            bkmrx_lib::commands::archive_delete_todo_tag,
            bkmrx_lib::commands::export_todos,
            bkmrx_lib::commands::export_bookmarks,
            bkmrx_lib::commands::preview_bookmark_import,
            bkmrx_lib::commands::apply_bookmark_import,
            bkmrx_lib::commands::scan_notes,
            bkmrx_lib::commands::read_note_file,
            bkmrx_lib::commands::write_note_file,
            bkmrx_lib::commands::create_note_file,
            bkmrx_lib::commands::delete_note,
            bkmrx_lib::commands::delete_note_folder,
            bkmrx_lib::commands::rename_note,
            bkmrx_lib::commands::get_settings,
            bkmrx_lib::commands::update_settings,
            bkmrx_lib::commands::activate_provider,
            bkmrx_lib::commands::deactivate_provider,
            bkmrx_lib::commands::get_server_status,
            bkmrx_lib::commands::get_system_info,
        ])
        .on_window_event(move |_window, event| {
            if let tauri::WindowEvent::CloseRequested { .. } = event {
                log::info!("application_shutdown_started");
                if let Some(service) = _window.try_state::<bkmrx_lib::notes::SharedNoteService>() {
                    service.stop();
                }
                if let Some(server) =
                    _window.try_state::<bkmrx_lib::http_server::SharedLocalHttpServer>()
                {
                    tauri::async_runtime::block_on(server.shutdown());
                }
                log::info!("application_shutdown_requested");
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running bkmrx");
}

fn install_panic_hook() {
    let previous = std::panic::take_hook();
    std::panic::set_hook(Box::new(move |info| {
        let location = info
            .location()
            .map(|location| format!("{}:{}", location.file(), location.line()))
            .unwrap_or_else(|| "unknown".to_owned());
        let message = info
            .payload()
            .downcast_ref::<&str>()
            .copied()
            .or_else(|| info.payload().downcast_ref::<String>().map(String::as_str))
            .unwrap_or("non-string panic payload");
        log::error!(
            "application_panicked location={:?} error={:?}",
            location,
            bkmrx_lib::logging::sanitize_error(message)
        );
        previous(info);
    }));
}

#[cfg(test)]
mod tests {
    use super::is_allowed_app_navigation;

    #[test]
    fn allows_application_urls() {
        assert!(is_allowed_app_navigation(
            &"tauri://localhost".parse().unwrap()
        ));
        assert!(is_allowed_app_navigation(
            &"http://tauri.localhost".parse().unwrap()
        ));
        assert!(is_allowed_app_navigation(
            &"https://tauri.localhost/path".parse().unwrap()
        ));
    }

    #[test]
    fn rejects_external_navigation() {
        assert!(!is_allowed_app_navigation(
            &"https://example.com/article".parse().unwrap()
        ));
        assert!(!is_allowed_app_navigation(
            &"file:///tmp/article.html".parse().unwrap()
        ));
    }
}
