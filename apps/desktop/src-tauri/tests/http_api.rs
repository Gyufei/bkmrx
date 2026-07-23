use std::sync::Arc;

use axum::{
    body::Body,
    http::{Request, StatusCode},
};
use bkmrx_lib::{
    bookmarks::{
        BookmarkService, CreateBookmark, SharedBookmarkService, SqliteBookmarkRepository,
        SqliteFtsSearch,
    },
    database::Database,
    http_server,
};
use http_body_util::BodyExt;
use serde_json::{json, Value};
use tower::ServiceExt;

fn service() -> SharedBookmarkService {
    let database = Arc::new(Database::open_in_memory().unwrap());
    Arc::new(BookmarkService::new(
        SqliteBookmarkRepository::new(Arc::clone(&database)),
        SqliteFtsSearch::new(database),
    ))
}

async fn json_response(response: axum::response::Response) -> (StatusCode, Value) {
    let status = response.status();
    let bytes = response.into_body().collect().await.unwrap().to_bytes();
    let json = serde_json::from_slice(&bytes).unwrap();
    (status, json)
}

fn json_request(method: &str, uri: &str, body: Value) -> Request<Body> {
    Request::builder()
        .method(method)
        .uri(uri)
        .header("content-type", "application/json")
        .body(Body::from(body.to_string()))
        .unwrap()
}

#[tokio::test]
async fn health_and_crud_routes_use_canonical_contracts() {
    let service = service();
    let app = http_server::router(Arc::clone(&service));

    let health = app
        .clone()
        .oneshot(Request::get("/api/health").body(Body::empty()).unwrap())
        .await
        .unwrap();
    let (status, json) = json_response(health).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(json, json!({ "status": "ok" }));

    let create_body = json!({
        "url": "https://example.com",
        "title": "Example",
        "description": "Description",
        "tags": ["rust", "web"]
    });
    let created = app
        .clone()
        .oneshot(json_request("POST", "/api/bookmarks", create_body.clone()))
        .await
        .unwrap();
    let (status, created) = json_response(created).await;
    assert_eq!(status, StatusCode::CREATED);
    assert_eq!(created["url"], "https://example.com");
    assert_eq!(created["access_count"], 0);
    let id = created["id"].as_i64().unwrap();

    let conflict = app
        .clone()
        .oneshot(json_request("POST", "/api/bookmarks", create_body))
        .await
        .unwrap();
    let (status, conflict) = json_response(conflict).await;
    assert_eq!(status, StatusCode::CONFLICT);
    assert_eq!(conflict["error"]["code"], "bookmark_url_conflict");

    let by_url = app
        .clone()
        .oneshot(
            Request::get("/api/bookmarks/by-url?url=https%3A%2F%2Fexample.com")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    let (status, by_url) = json_response(by_url).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(by_url["id"], id);

    let get = app
        .clone()
        .oneshot(
            Request::get(format!("/api/bookmarks/{id}"))
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    let (status, get) = json_response(get).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(get["title"], "Example");

    let updated = app
        .clone()
        .oneshot(json_request(
            "PATCH",
            &format!("/api/bookmarks/{id}"),
            json!({ "title": "Updated", "tags": ["new"] }),
        ))
        .await
        .unwrap();
    let (status, updated) = json_response(updated).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(updated["title"], "Updated");
    assert_eq!(updated["tags"], json!(["new"]));

    let tags = app
        .clone()
        .oneshot(Request::get("/api/tags").body(Body::empty()).unwrap())
        .await
        .unwrap();
    let (status, tags) = json_response(tags).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(tags, json!([{ "name": "new", "count": 1 }]));

    let deleted = app
        .clone()
        .oneshot(
            Request::delete(format!("/api/bookmarks/{id}"))
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(deleted.status(), StatusCode::NO_CONTENT);

    let missing = app
        .oneshot(
            Request::get(format!("/api/bookmarks/{id}"))
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    let (status, missing) = json_response(missing).await;
    assert_eq!(status, StatusCode::NOT_FOUND);
    assert_eq!(missing["error"]["code"], "bookmark_not_found");
}

#[tokio::test]
async fn list_route_defaults_to_fifty_and_maps_cursor_errors() {
    let service = service();
    for index in 0..51 {
        service
            .create(CreateBookmark {
                url: format!("https://example.com/{index}"),
                title: format!("Bookmark {index}"),
                description: String::new(),
                tags: vec!["bulk".to_owned()],
            })
            .unwrap();
    }
    let app = http_server::router(service);

    let response = app
        .clone()
        .oneshot(
            Request::get("/api/bookmarks?tags=bulk")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    let (status, page) = json_response(response).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(page["items"].as_array().unwrap().len(), 50);
    assert!(page["next_cursor"].is_string());

    let invalid = app
        .oneshot(
            Request::get("/api/bookmarks?cursor=not-a-cursor")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    let (status, invalid) = json_response(invalid).await;
    assert_eq!(status, StatusCode::BAD_REQUEST);
    assert_eq!(invalid["error"]["code"], "invalid_cursor");
}
