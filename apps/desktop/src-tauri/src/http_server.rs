use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::OnceLock;

use crate::bookmarks::{
    Bookmark, BookmarkPage, BookmarkPageRequest, CreateBookmark, SharedBookmarkService,
    TagQueryRequest, TagSummary, UpdateBookmark,
};
use crate::error::AppError;
use crate::translation::{TranslationRequest, TranslationService};
use axum::{
    body::Body,
    extract::{
        rejection::{JsonRejection, PathRejection, QueryRejection},
        Path, Query, State,
    },
    http::StatusCode,
    middleware::{self, Next},
    response::{Html, IntoResponse, Response},
    routing::get,
    Json, Router,
};
use serde::{Deserialize, Serialize};

use crate::logging::{sanitize_error, Operation};

static SERVER_URL: OnceLock<String> = OnceLock::new();
static SERVER_RUNNING: AtomicBool = AtomicBool::new(false);

#[derive(Clone)]
struct HttpState {
    bookmarks: SharedBookmarkService,
    translation: TranslationService,
}

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
    router_with_translation(service, TranslationService::unavailable())
}

pub fn router_with_translation(
    bookmarks: SharedBookmarkService,
    translation: TranslationService,
) -> Router {
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
        .route("/api/translations", axum::routing::post(translate_handler))
        .route("/api/docs", get(docs_handler))
        .with_state(HttpState {
            bookmarks,
            translation,
        })
        .layer(middleware::from_fn(log_http_request))
}

pub async fn start_server(
    service: SharedBookmarkService,
    settings_path: std::path::PathBuf,
    shutdown_rx: tokio::sync::oneshot::Receiver<()>,
) {
    let operation = Operation::start();
    log::info!(
        "http_server_start_started operation_id={} address=127.0.0.1:8733",
        operation.id()
    );
    let listener = match tokio::net::TcpListener::bind(std::net::SocketAddr::from((
        [127, 0, 0, 1],
        8733,
    )))
    .await
    {
        Ok(listener) => listener,
        Err(error) => {
            log::error!(
                    "http_server_start_failed operation_id={} address=127.0.0.1:8733 elapsed_ms={} error={:?}",
                    operation.id(),
                    operation.elapsed_ms(),
                    sanitize_error(&error.to_string())
                );
            return;
        }
    };

    let _ = SERVER_URL.set("http://127.0.0.1:8733".to_owned());
    SERVER_RUNNING.store(true, Ordering::SeqCst);
    log::info!(
        "http_server_started operation_id={} address=127.0.0.1:8733 elapsed_ms={}",
        operation.id(),
        operation.elapsed_ms()
    );
    let translation = TranslationService::from_settings_path(settings_path);
    if let Err(error) = axum::serve(listener, router_with_translation(service, translation))
        .with_graceful_shutdown(async {
            let _ = shutdown_rx.await;
        })
        .await
    {
        log::error!(
            "http_server_failed error={:?}",
            sanitize_error(&error.to_string())
        );
    }
    SERVER_RUNNING.store(false, Ordering::SeqCst);
    log::info!("http_server_stopped");
}

async fn log_http_request(request: axum::http::Request<Body>, next: Next) -> Response {
    let operation = Operation::start();
    let method = request.method().clone();
    let path = request.uri().path().to_owned();
    log::debug!(
        "http_request_started operation_id={} method={} path={:?}",
        operation.id(),
        method,
        path
    );
    let response = next.run(request).await;
    let status = response.status();
    let message = format!(
        "http_request_completed operation_id={} method={} path={:?} status={} elapsed_ms={}",
        operation.id(),
        method,
        path,
        status.as_u16(),
        operation.elapsed_ms()
    );
    if status.is_server_error() {
        log::error!("{message}");
    } else if status.is_client_error() {
        log::warn!("{message}");
    } else {
        log::info!("{message}");
    }
    response
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
    State(state): State<HttpState>,
    query: Result<Query<BookmarkListQuery>, QueryRejection>,
) -> Result<Json<BookmarkPage>, ApiError> {
    let Query(query) = query.map_err(|error| ApiError::Request(error.status()))?;
    let tags: Vec<String> = query
        .tags
        .split(',')
        .map(str::trim)
        .filter(|tag| !tag.is_empty())
        .map(str::to_owned)
        .collect();
    let request = if query.query.trim().is_empty() && tags.is_empty() {
        BookmarkPageRequest::Browse {
            starred: false,
            cursor: query.cursor,
            page_size: query.page_size,
        }
    } else {
        BookmarkPageRequest::Search {
            query: query.query,
            tags,
            cursor: query.cursor,
            page_size: query.page_size,
        }
    };
    state
        .bookmarks
        .query(request)
        .map(Json)
        .map_err(ApiError::App)
}

async fn create_bookmark_handler(
    State(state): State<HttpState>,
    input: Result<Json<CreateBookmark>, JsonRejection>,
) -> Result<(StatusCode, Json<Bookmark>), ApiError> {
    let Json(input) = input.map_err(ApiError::Json)?;
    state
        .bookmarks
        .create(input)
        .map(|bookmark| (StatusCode::CREATED, Json(bookmark)))
        .map_err(ApiError::App)
}

async fn get_bookmark_by_url_handler(
    State(state): State<HttpState>,
    query: Result<Query<BookmarkUrlQuery>, QueryRejection>,
) -> Result<Json<Bookmark>, ApiError> {
    let Query(query) = query.map_err(|error| ApiError::Request(error.status()))?;
    let url = query.url;
    state
        .bookmarks
        .get_by_url(url.clone())
        .and_then(|bookmark| bookmark.ok_or_else(|| AppError::bookmark_url_not_found(url)))
        .map(Json)
        .map_err(ApiError::App)
}

async fn get_bookmark_handler(
    State(state): State<HttpState>,
    id: Result<Path<i64>, PathRejection>,
) -> Result<Json<Bookmark>, ApiError> {
    let Path(id) = id.map_err(|error| ApiError::Request(error.status()))?;
    state
        .bookmarks
        .get_by_id(id)
        .map(Json)
        .map_err(ApiError::App)
}

async fn update_bookmark_handler(
    State(state): State<HttpState>,
    id: Result<Path<i64>, PathRejection>,
    input: Result<Json<UpdateBookmark>, JsonRejection>,
) -> Result<Json<Bookmark>, ApiError> {
    let Path(id) = id.map_err(|error| ApiError::Request(error.status()))?;
    let Json(input) = input.map_err(ApiError::Json)?;
    state
        .bookmarks
        .update(id, input)
        .map(Json)
        .map_err(ApiError::App)
}

async fn delete_bookmark_handler(
    State(state): State<HttpState>,
    id: Result<Path<i64>, PathRejection>,
) -> Result<StatusCode, ApiError> {
    let Path(id) = id.map_err(|error| ApiError::Request(error.status()))?;
    state.bookmarks.get_by_id(id).map_err(ApiError::App)?;
    state
        .bookmarks
        .delete_many(vec![id])
        .map_err(ApiError::App)?;
    Ok(StatusCode::NO_CONTENT)
}

async fn get_tags_handler(
    State(state): State<HttpState>,
) -> Result<Json<Vec<TagSummary>>, ApiError> {
    state
        .bookmarks
        .get_tags(TagQueryRequest {
            query: String::new(),
            limit: None,
        })
        .map(Json)
        .map_err(ApiError::App)
}

async fn translate_handler(
    State(state): State<HttpState>,
    request: Result<Json<TranslationRequest>, JsonRejection>,
) -> Result<Json<crate::translation::Translation>, ApiError> {
    let Json(request) = request.map_err(ApiError::Json)?;
    let provider = state.translation.provider_name();
    state
        .translation
        .translate(request)
        .await
        .map(Json)
        .map_err(|error| {
            ApiError::App(AppError::translation_error(
                error.code(),
                error.to_string(),
                provider,
            ))
        })
}

async fn docs_handler() -> Html<&'static str> {
    Html(include_str!("api_docs.html"))
}

fn default_page_size() -> u32 {
    50
}

enum ApiError {
    App(AppError),
    Json(JsonRejection),
    Request(StatusCode),
}

impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        let (status, error) = match self {
            Self::App(error) => (status_for_error(&error), error),
            Self::Json(rejection) => (
                rejection.status(),
                AppError::validation_error("Request body is invalid"),
            ),
            Self::Request(status) => (
                status,
                AppError::validation_error("Request parameters are invalid"),
            ),
        };
        (status, Json(serde_json::json!({ "error": error }))).into_response()
    }
}

fn status_for_error(error: &AppError) -> StatusCode {
    match error.code.as_str() {
        "validation_error"
        | "invalid_cursor"
        | "unsupported_import_format"
        | "import_validation_failed" => StatusCode::BAD_REQUEST,
        "bookmark_not_found" => StatusCode::NOT_FOUND,
        "bookmark_url_conflict" => StatusCode::CONFLICT,
        "translation_validation_error" => StatusCode::BAD_REQUEST,
        "translation_unavailable" => StatusCode::SERVICE_UNAVAILABLE,
        "translation_failed" => StatusCode::BAD_GATEWAY,
        _ => StatusCode::INTERNAL_SERVER_ERROR,
    }
}

#[cfg(test)]
mod tests {
    use std::sync::Arc;

    use axum::{
        body::Body,
        http::{header, Method, Request, StatusCode},
    };
    use http_body_util::BodyExt;
    use tower::ServiceExt;

    use super::router;
    use crate::{
        bookmarks::{BookmarkService, SqliteBookmarkRepository, SqliteFtsSearch},
        database::Database,
    };

    fn test_router() -> axum::Router {
        let database = Arc::new(Database::open_in_memory().expect("open test database"));
        let service = Arc::new(BookmarkService::new(
            SqliteBookmarkRepository::new(Arc::clone(&database)),
            SqliteFtsSearch::new(database),
        ));
        router(service)
    }

    #[tokio::test]
    async fn serves_api_requests_without_cross_origin_headers() {
        let response = test_router()
            .oneshot(
                Request::builder()
                    .uri("/api/health")
                    .header(header::ORIGIN, "https://malicious.example")
                    .body(Body::empty())
                    .expect("build request"),
            )
            .await
            .expect("serve request");

        assert_eq!(response.status(), StatusCode::OK);
        assert!(response
            .headers()
            .get(header::ACCESS_CONTROL_ALLOW_ORIGIN)
            .is_none());
    }

    #[tokio::test]
    async fn rejects_browser_cors_preflight_requests() {
        let response = test_router()
            .oneshot(
                Request::builder()
                    .method(Method::OPTIONS)
                    .uri("/api/bookmarks/1")
                    .header(header::ORIGIN, "https://malicious.example")
                    .header(
                        header::ACCESS_CONTROL_REQUEST_METHOD,
                        Method::PATCH.as_str(),
                    )
                    .body(Body::empty())
                    .expect("build request"),
            )
            .await
            .expect("serve request");

        assert_eq!(response.status(), StatusCode::METHOD_NOT_ALLOWED);
        assert!(response
            .headers()
            .get(header::ACCESS_CONTROL_ALLOW_ORIGIN)
            .is_none());
    }

    #[tokio::test]
    async fn rejects_simple_cross_origin_write_content_types() {
        let response = test_router()
            .oneshot(
                Request::builder()
                    .method(Method::POST)
                    .uri("/api/bookmarks")
                    .header(header::ORIGIN, "https://malicious.example")
                    .header(header::CONTENT_TYPE, "text/plain")
                    .body(Body::from(
                        r#"{"url":"https://example.com","title":"Example","description":"","tags":[]}"#,
                    ))
                    .expect("build request"),
            )
            .await
            .expect("serve request");

        assert_eq!(response.status(), StatusCode::UNSUPPORTED_MEDIA_TYPE);
        let body = response.into_body().collect().await.unwrap().to_bytes();
        let json: serde_json::Value = serde_json::from_slice(&body).unwrap();
        assert_eq!(json["error"]["code"], "validation_error");
    }

    #[tokio::test]
    async fn translation_route_uses_the_standard_error_envelope() {
        let response = test_router()
            .oneshot(
                Request::builder()
                    .method(Method::POST)
                    .uri("/api/translations")
                    .header(header::CONTENT_TYPE, "application/json")
                    .body(Body::from(r#"{"text":"Hello"}"#))
                    .expect("build request"),
            )
            .await
            .expect("serve request");

        assert_eq!(response.status(), StatusCode::SERVICE_UNAVAILABLE);
        let body = response.into_body().collect().await.unwrap().to_bytes();
        let json: serde_json::Value = serde_json::from_slice(&body).unwrap();
        assert_eq!(json["error"]["code"], "translation_unavailable");
    }

    #[tokio::test]
    async fn invalid_query_parameters_use_the_standard_error_envelope() {
        let response = test_router()
            .oneshot(
                Request::get("/api/bookmarks/by-url")
                    .body(Body::empty())
                    .expect("build request"),
            )
            .await
            .expect("serve request");

        assert_eq!(response.status(), StatusCode::BAD_REQUEST);
        let body = response.into_body().collect().await.unwrap().to_bytes();
        let json: serde_json::Value = serde_json::from_slice(&body).unwrap();
        assert_eq!(json["error"]["code"], "validation_error");
    }
}
