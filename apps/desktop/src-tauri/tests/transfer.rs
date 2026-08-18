use std::{fs, path::Path, sync::Arc};

use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine};
use bkmrx_lib::{
    bookmarks::{
        BookmarkPageRequest, BookmarkService, CreateBookmark, SqliteBookmarkRepository,
        SqliteFtsSearch,
    },
    database::Database,
};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use tempfile::TempDir;

type Service = BookmarkService<SqliteBookmarkRepository, SqliteFtsSearch>;

fn service() -> (Arc<Database>, Service) {
    let database = Arc::new(Database::open_in_memory().unwrap());
    let service = BookmarkService::new(
        SqliteBookmarkRepository::new(Arc::clone(&database)),
        SqliteFtsSearch::new(Arc::clone(&database)),
    );
    (database, service)
}

fn create(service: &Service, url: &str) {
    service
        .create(CreateBookmark {
            url: url.to_owned(),
            title: "Example".to_owned(),
            description: "Description".to_owned(),
            tags: vec!["rust".to_owned(), "中文".to_owned()],
        })
        .unwrap();
}

fn write_json(directory: &TempDir, name: &str, value: Value) -> std::path::PathBuf {
    let path = directory.path().join(name);
    fs::write(&path, serde_json::to_vec_pretty(&value).unwrap()).unwrap();
    path
}

fn hash_file(path: &Path) -> String {
    URL_SAFE_NO_PAD.encode(Sha256::digest(fs::read(path).unwrap()))
}

fn record(url: &str) -> Value {
    json!({
        "url": url,
        "title": "Imported",
        "description": "Imported description",
        "tags": ["imported", " 中文 ", "imported"],
        "access_count": 7,
        "created_at": "2020-01-01T00:00:00Z",
        "updated_at": "2099-01-01T00:00:00Z",
        "accessed_at": "2025-01-01T00:00:00Z"
    })
}

fn export(records: Vec<Value>) -> Value {
    json!({
        "format_version": 1,
        "exported_at": "2026-07-23T12:00:00Z",
        "app_version": "0.1.0",
        "bookmarks": records
    })
}

#[test]
fn export_v1_omits_database_ids() {
    let (_, service) = service();
    create(&service, "https://example.com");
    let directory = TempDir::new().unwrap();

    let path = service.export_bookmarks(directory.path()).unwrap();
    let json: Value = serde_json::from_slice(&fs::read(path).unwrap()).unwrap();

    assert_eq!(json["format_version"], 1);
    assert!(json["bookmarks"][0].get("id").is_none());
    assert_eq!(json["bookmarks"][0]["url"], "https://example.com");
    assert!(json["bookmarks"][0].get("starred_at").is_some());
    assert!(json["bookmarks"][0]["starred_at"].is_null());
}

#[test]
fn exported_starred_at_round_trips_into_empty_database() {
    let (_, source) = service();
    create(&source, "https://example.com");
    let source_bookmark = source
        .get_by_url("https://example.com".to_owned())
        .unwrap()
        .unwrap();
    source.set_starred(source_bookmark.id, true).unwrap();
    let directory = TempDir::new().unwrap();
    let path = source.export_bookmarks(directory.path()).unwrap();
    let (_, target) = service();

    let preview = target.preview_bookmark_import(&path).unwrap();
    target
        .apply_bookmark_import(&path, &preview.file_hash)
        .unwrap();

    assert!(target
        .get_by_url("https://example.com".to_owned())
        .unwrap()
        .unwrap()
        .starred_at
        .is_some());
}

#[test]
fn exported_starred_at_preserves_milliseconds_and_import_order() {
    let (source_database, source) = service();
    create(&source, "https://a.example");
    create(&source, "https://z.example");
    let later = source
        .get_by_url("https://a.example".to_owned())
        .unwrap()
        .unwrap();
    let earlier = source
        .get_by_url("https://z.example".to_owned())
        .unwrap()
        .unwrap();
    source_database
        .execute_batch_for_test(&format!(
            "UPDATE bookmarks SET starred_at = 1767225600456 WHERE id = {};
             UPDATE bookmarks SET starred_at = 1767225600123 WHERE id = {};",
            later.id, earlier.id
        ))
        .unwrap();
    let directory = TempDir::new().unwrap();
    let path = source.export_bookmarks(directory.path()).unwrap();
    let exported: Value = serde_json::from_slice(&fs::read(&path).unwrap()).unwrap();

    assert_eq!(
        exported["bookmarks"][0]["starred_at"],
        "2026-01-01T00:00:00.456Z"
    );
    assert_eq!(
        exported["bookmarks"][1]["starred_at"],
        "2026-01-01T00:00:00.123Z"
    );

    let (_, target) = service();
    let preview = target.preview_bookmark_import(&path).unwrap();
    target
        .apply_bookmark_import(&path, &preview.file_hash)
        .unwrap();
    let page = target
        .query(BookmarkPageRequest::Browse {
            starred: true,
            cursor: None,
            page_size: 50,
        })
        .unwrap();

    assert_eq!(
        page.items
            .iter()
            .map(|bookmark| bookmark.url.as_str())
            .collect::<Vec<_>>(),
        vec!["https://a.example", "https://z.example"]
    );
}

#[test]
fn legacy_import_without_starred_at_preserves_existing_local_star() {
    let (_, service) = service();
    create(&service, "https://example.com");
    let local = service
        .get_by_url("https://example.com".to_owned())
        .unwrap()
        .unwrap();
    service.set_starred(local.id, true).unwrap();
    let directory = TempDir::new().unwrap();
    let path = write_json(
        &directory,
        "legacy.json",
        export(vec![record("https://example.com")]),
    );

    let preview = service.preview_bookmark_import(&path).unwrap();
    service
        .apply_bookmark_import(&path, &preview.file_hash)
        .unwrap();

    assert!(service
        .get_by_url("https://example.com".to_owned())
        .unwrap()
        .unwrap()
        .starred_at
        .is_some());
}

#[test]
fn newer_import_with_explicit_null_clears_existing_local_star() {
    let (_, service) = service();
    create(&service, "https://example.com");
    let local = service
        .get_by_url("https://example.com".to_owned())
        .unwrap()
        .unwrap();
    service.set_starred(local.id, true).unwrap();
    let directory = TempDir::new().unwrap();
    let mut imported = record("https://example.com");
    imported["starred_at"] = Value::Null;
    let path = write_json(&directory, "clear-star.json", export(vec![imported]));

    let preview = service.preview_bookmark_import(&path).unwrap();
    service
        .apply_bookmark_import(&path, &preview.file_hash)
        .unwrap();

    assert_eq!(
        service
            .get_by_url("https://example.com".to_owned())
            .unwrap()
            .unwrap()
            .starred_at,
        None
    );
}

#[test]
fn exported_json_round_trips_into_empty_database() {
    let (_, source) = service();
    create(&source, "legacy value that is not a parsed URL");
    let directory = TempDir::new().unwrap();
    let path = source.export_bookmarks(directory.path()).unwrap();
    let (_, target) = service();

    let preview = target.preview_bookmark_import(&path).unwrap();
    assert_eq!(preview.create_count, 1);
    target
        .apply_bookmark_import(&path, &preview.file_hash)
        .unwrap();

    let imported = target
        .get_by_url("legacy value that is not a parsed URL".to_owned())
        .unwrap()
        .unwrap();
    assert_eq!(imported.title, "Example");
    assert_eq!(imported.tags, vec!["rust", "中文"]);
}

#[test]
fn preview_rejects_tags_that_cannot_use_the_http_filter_contract() {
    let (_, service) = service();
    let directory = TempDir::new().unwrap();
    let mut invalid = record("https://example.com");
    invalid["tags"] = json!(["a,b"]);
    let path = write_json(&directory, "comma-tag.json", export(vec![invalid]));

    let error = service.preview_bookmark_import(path).unwrap_err();

    assert_eq!(error.code(), "import_validation_failed");
}

#[test]
fn preview_rejects_invalid_starred_at() {
    let (_, service) = service();
    let directory = TempDir::new().unwrap();
    let mut invalid = record("https://example.com");
    invalid["starred_at"] = json!("not-a-timestamp");
    let path = write_json(&directory, "invalid-star.json", export(vec![invalid]));

    let error = service.preview_bookmark_import(path).unwrap_err();

    assert_eq!(error.code(), "import_validation_failed");
}

#[test]
fn legacy_import_without_starred_at_creates_unstarred_bookmark() {
    let (_, service) = service();
    let directory = TempDir::new().unwrap();
    let path = write_json(
        &directory,
        "legacy-new.json",
        export(vec![record("https://example.com")]),
    );

    let preview = service.preview_bookmark_import(&path).unwrap();
    service
        .apply_bookmark_import(&path, &preview.file_hash)
        .unwrap();

    assert_eq!(
        service
            .get_by_url("https://example.com".to_owned())
            .unwrap()
            .unwrap()
            .starred_at,
        None
    );
}

#[test]
fn preview_rejects_unknown_format() {
    let (_, service) = service();
    let directory = TempDir::new().unwrap();
    let path = write_json(
        &directory,
        "unknown.json",
        json!({ "format_version": 2, "bookmarks": [] }),
    );

    let error = service.preview_bookmark_import(path).unwrap_err();

    assert_eq!(error.code(), "unsupported_import_format");
}

#[test]
fn preview_rejects_duplicate_urls() {
    let (_, service) = service();
    let directory = TempDir::new().unwrap();
    let path = write_json(
        &directory,
        "duplicates.json",
        export(vec![
            record("https://example.com"),
            record("https://example.com"),
        ]),
    );

    let error = service.preview_bookmark_import(path).unwrap_err();

    assert_eq!(error.code(), "import_validation_failed");
}

#[test]
fn apply_rejects_file_changed_after_preview() {
    let (_, service) = service();
    let directory = TempDir::new().unwrap();
    let path = write_json(
        &directory,
        "changed.json",
        export(vec![record("https://example.com")]),
    );
    let preview = service.preview_bookmark_import(&path).unwrap();
    fs::write(
        &path,
        serde_json::to_vec_pretty(&export(Vec::new())).unwrap(),
    )
    .unwrap();

    let error = service
        .apply_bookmark_import(path, &preview.file_hash)
        .unwrap_err();

    assert_eq!(error.code(), "import_validation_failed");
}

#[test]
fn merge_uses_newer_content_earlier_created_and_larger_access_count() {
    let (database, service) = service();
    create(&service, "https://example.com");
    database
        .execute_batch_for_test(
            "UPDATE bookmarks
             SET created_at = 1735689600000,
                 updated_at = 1735689600000,
                 access_count = 2,
                 accessed_at = NULL",
        )
        .unwrap();
    let directory = TempDir::new().unwrap();
    let path = write_json(
        &directory,
        "merge.json",
        export(vec![record("https://example.com")]),
    );

    let preview = service.preview_bookmark_import(&path).unwrap();
    assert_eq!(preview.update_count, 1);
    service
        .apply_bookmark_import(path, &preview.file_hash)
        .unwrap();

    let bookmark = service
        .get_by_url("https://example.com".to_owned())
        .unwrap()
        .unwrap();
    assert_eq!(bookmark.title, "Imported");
    assert_eq!(bookmark.description, "Imported description");
    assert_eq!(bookmark.tags, vec!["imported", "中文"]);
    assert_eq!(bookmark.created_at, "2020-01-01T00:00:00Z");
    assert_eq!(bookmark.updated_at, "2099-01-01T00:00:00Z");
    assert_eq!(bookmark.access_count, 7);
    assert_eq!(
        bookmark.accessed_at.as_deref(),
        Some("2025-01-01T00:00:00Z")
    );
}

#[test]
fn one_invalid_record_rolls_back_entire_import() {
    let (database, service) = service();
    let directory = TempDir::new().unwrap();
    let path = write_json(
        &directory,
        "invalid.json",
        export(vec![record("https://valid.example"), record("")]),
    );
    let hash = hash_file(&path);

    let error = service.apply_bookmark_import(path, &hash).unwrap_err();

    assert_eq!(error.code(), "import_validation_failed");
    assert_eq!(
        database
            .query_i64_for_test("SELECT count(*) FROM bookmarks")
            .unwrap(),
        0
    );
}

#[test]
fn database_failure_rolls_back_records_already_imported_in_same_transaction() {
    let (database, service) = service();
    database
        .execute_batch_for_test(
            "CREATE TRIGGER reject_second_import
             BEFORE INSERT ON bookmarks
             WHEN NEW.url = 'https://reject.example/'
             BEGIN
                 SELECT RAISE(ABORT, 'forced import failure');
             END;",
        )
        .unwrap();
    let directory = TempDir::new().unwrap();
    let path = write_json(
        &directory,
        "rollback.json",
        export(vec![
            record("https://first.example/"),
            record("https://reject.example/"),
        ]),
    );
    let preview = service.preview_bookmark_import(&path).unwrap();

    let error = service
        .apply_bookmark_import(path, &preview.file_hash)
        .unwrap_err();

    assert_eq!(error.code(), "database_error");
    assert_eq!(
        database
            .query_i64_for_test("SELECT count(*) FROM bookmarks")
            .unwrap(),
        0
    );
    assert_eq!(
        database
            .query_i64_for_test("SELECT count(*) FROM bookmarks_fts")
            .unwrap(),
        0
    );
}
