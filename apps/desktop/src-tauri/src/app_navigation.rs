#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum AppNavigation {
    AppShell,
    EmbeddedDocumentBootstrap,
    Denied,
}

pub(crate) fn classify_app_navigation(url: &tauri::Url) -> AppNavigation {
    if url.scheme() == "about" && matches!(url.path(), "blank" | "srcdoc") {
        return AppNavigation::EmbeddedDocumentBootstrap;
    }
    if url.scheme() == "tauri" && url.host_str() == Some("localhost") {
        return AppNavigation::AppShell;
    }
    if matches!(url.scheme(), "http" | "https") && url.host_str() == Some("tauri.localhost") {
        return AppNavigation::AppShell;
    }
    if tauri::is_dev()
        && url.scheme() == "http"
        && url.host_str() == Some("localhost")
        && url.port() == Some(1420)
    {
        return AppNavigation::AppShell;
    }
    AppNavigation::Denied
}

pub(crate) fn is_allowed_app_navigation(url: &tauri::Url) -> bool {
    classify_app_navigation(url) != AppNavigation::Denied
}
