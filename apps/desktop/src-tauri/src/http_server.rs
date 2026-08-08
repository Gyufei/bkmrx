use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::OnceLock;

use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    response::{Html, IntoResponse, Response},
    routing::get,
    Json, Router,
};
use serde::{Deserialize, Serialize};
use tower_http::cors::CorsLayer;

use crate::bookmarks::{
    AppError, Bookmark, BookmarkPage, BookmarkPageRequest, CreateBookmark, SharedBookmarkService,
    TagQueryRequest, TagSummary, UpdateBookmark,
};

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
        url: SERVER_URL
            .get()
            .cloned()
            .unwrap_or_else(|| "http://127.0.0.1:8733".to_owned()),
    }
}

pub fn router(service: SharedBookmarkService) -> Router {
    Router::new()
        .route("/api/health", get(health_handler))
        .route(
            "/api/bookmarks",
            get(list_bookmarks_handler).post(create_bookmark_handler),
        )
        .route("/api/bookmarks/by-url", get(get_bookmark_by_url_handler))
        .route(
            "/api/bookmarks/:id",
            get(get_bookmark_handler)
                .patch(update_bookmark_handler)
                .delete(delete_bookmark_handler),
        )
        .route("/api/tags", get(get_tags_handler))
        .route("/api/docs", get(docs_handler))
        .layer(CorsLayer::permissive())
        .with_state(service)
}

pub async fn start_server(
    service: SharedBookmarkService,
    shutdown_rx: tokio::sync::oneshot::Receiver<()>,
) {
    let listener =
        match tokio::net::TcpListener::bind(std::net::SocketAddr::from(([127, 0, 0, 1], 8733)))
            .await
        {
            Ok(listener) => listener,
            Err(error) => {
                eprintln!("Failed to bind HTTP server on 127.0.0.1:8733: {error}");
                return;
            }
        };

    let _ = SERVER_URL.set("http://127.0.0.1:8733".to_owned());
    SERVER_RUNNING.store(true, Ordering::SeqCst);
    if let Err(error) = axum::serve(listener, router(service))
        .with_graceful_shutdown(async {
            let _ = shutdown_rx.await;
        })
        .await
    {
        eprintln!("HTTP server error: {error}");
    }
    SERVER_RUNNING.store(false, Ordering::SeqCst);
}

#[derive(Debug, Deserialize)]
struct BookmarkListQuery {
    #[serde(default)]
    query: String,
    #[serde(default)]
    tags: String,
    cursor: Option<String>,
    #[serde(default = "default_page_size")]
    page_size: u32,
}

#[derive(Debug, Deserialize)]
struct BookmarkUrlQuery {
    url: String,
}

async fn health_handler() -> Json<serde_json::Value> {
    Json(serde_json::json!({ "status": "ok" }))
}

async fn list_bookmarks_handler(
    State(service): State<SharedBookmarkService>,
    Query(query): Query<BookmarkListQuery>,
) -> Result<Json<BookmarkPage>, ApiError> {
    let tags = query
        .tags
        .split(',')
        .map(str::trim)
        .filter(|tag| !tag.is_empty())
        .map(str::to_owned)
        .collect();
    service
        .query(BookmarkPageRequest {
            query: query.query,
            tags,
            cursor: query.cursor,
            page_size: query.page_size,
            starred_only: false,
        })
        .map(Json)
        .map_err(ApiError)
}

async fn create_bookmark_handler(
    State(service): State<SharedBookmarkService>,
    Json(input): Json<CreateBookmark>,
) -> Result<(StatusCode, Json<Bookmark>), ApiError> {
    service
        .create(input)
        .map(|bookmark| (StatusCode::CREATED, Json(bookmark)))
        .map_err(ApiError)
}

async fn get_bookmark_by_url_handler(
    State(service): State<SharedBookmarkService>,
    Query(query): Query<BookmarkUrlQuery>,
) -> Result<Json<Bookmark>, ApiError> {
    let url = query.url;
    service
        .get_by_url(url.clone())
        .and_then(|bookmark| bookmark.ok_or_else(|| AppError::bookmark_url_not_found(url)))
        .map(Json)
        .map_err(ApiError)
}

async fn get_bookmark_handler(
    State(service): State<SharedBookmarkService>,
    Path(id): Path<i64>,
) -> Result<Json<Bookmark>, ApiError> {
    service.get_by_id(id).map(Json).map_err(ApiError)
}

async fn update_bookmark_handler(
    State(service): State<SharedBookmarkService>,
    Path(id): Path<i64>,
    Json(input): Json<UpdateBookmark>,
) -> Result<Json<Bookmark>, ApiError> {
    service.update(id, input).map(Json).map_err(ApiError)
}

async fn delete_bookmark_handler(
    State(service): State<SharedBookmarkService>,
    Path(id): Path<i64>,
) -> Result<StatusCode, ApiError> {
    service.get_by_id(id).map_err(ApiError)?;
    service.delete_many(vec![id]).map_err(ApiError)?;
    Ok(StatusCode::NO_CONTENT)
}

async fn get_tags_handler(
    State(service): State<SharedBookmarkService>,
) -> Result<Json<Vec<TagSummary>>, ApiError> {
    service
        .get_tags(TagQueryRequest {
            query: String::new(),
            limit: None,
        })
        .map(Json)
        .map_err(ApiError)
}

async fn docs_handler() -> Html<&'static str> {
    Html(include_str!("api_docs.html"))
}

fn default_page_size() -> u32 {
    50
}

struct ApiError(AppError);

impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        let status = match self.0.code.as_str() {
            "validation_error"
            | "invalid_cursor"
            | "unsupported_import_format"
            | "import_validation_failed" => StatusCode::BAD_REQUEST,
            "bookmark_not_found" => StatusCode::NOT_FOUND,
            "bookmark_url_conflict" => StatusCode::CONFLICT,
            _ => StatusCode::INTERNAL_SERVER_ERROR,
        };
        (status, Json(serde_json::json!({ "error": self.0 }))).into_response()
    }
}
