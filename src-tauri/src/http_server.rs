use axum::{
    http::StatusCode,
    response::{Html, Json},
    routing::{get, post},
    Router,
};
use serde::{Deserialize, Serialize};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::OnceLock;

static SERVER_URL: OnceLock<String> = OnceLock::new();
static SERVER_RUNNING: AtomicBool = AtomicBool::new(false);

#[derive(Debug, Clone, Serialize)]
pub struct ServerStatus {
    pub running: bool,
    pub url: String,
}

pub fn status() -> ServerStatus {
    ServerStatus {
        running: SERVER_RUNNING.load(Ordering::SeqCst),
        url: SERVER_URL.get().cloned().unwrap_or_else(|| "http://127.0.0.1:8733".to_string()),
    }
}

pub async fn start_server(shutdown_rx: tokio::sync::oneshot::Receiver<()>) {
    let app = Router::new()
        .route("/api/bookmarks", post(add_bookmark_handler))
        .route("/api/tags", get(get_tags_handler))
        .route("/api/docs", get(docs_handler));

    let addr = std::net::SocketAddr::from(([127, 0, 0, 1], 8733));
    let listener = match tokio::net::TcpListener::bind(addr).await {
        Ok(l) => l,
        Err(e) => {
            eprintln!("Failed to bind HTTP server on 127.0.0.1:8733: {e}");
            return;
        }
    };

    SERVER_URL.set("http://127.0.0.1:8733".to_string()).ok();
    SERVER_RUNNING.store(true, Ordering::SeqCst);

    axum::serve(listener, app)
        .with_graceful_shutdown(async { shutdown_rx.await.ok(); })
        .await
        .unwrap_or_else(|e| eprintln!("HTTP server error: {e}"));
}

#[derive(Deserialize)]
struct AddBookmarkRequest {
    url: String,
    title: Option<String>,
    #[serde(default)]
    tags: Vec<String>,
}

async fn add_bookmark_handler(
    Json(req): Json<AddBookmarkRequest>,
) -> Result<Json<serde_json::Value>, (StatusCode, Json<serde_json::Value>)> {
    let title = req.title.unwrap_or_else(|| req.url.clone());
    match crate::bkmr::add_bookmark(&req.url, &title, &req.tags).await {
        Ok(id) => Ok(Json(serde_json::json!({
            "id": id,
            "status": "created"
        }))),
        Err(e) => Err((
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({ "error": e })),
        )),
    }
}

async fn get_tags_handler() -> Result<Json<serde_json::Value>, (StatusCode, String)> {
    match crate::bkmr::get_tags().await {
        Ok(tags) => Ok(Json(serde_json::to_value(tags).unwrap())),
        Err(e) => Err((StatusCode::INTERNAL_SERVER_ERROR, e)),
    }
}

async fn docs_handler() -> Html<&'static str> {
    Html(include_str!("api_docs.html"))
}
