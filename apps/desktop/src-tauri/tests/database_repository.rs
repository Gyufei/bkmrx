use bkmrx_lib::bookmarks::{
    BookmarkRepository, CreateBookmark, SqliteBookmarkRepository, UpdateBookmark,
};
use bkmrx_lib::database::Database;
use std::sync::Arc;

#[test]
fn creates_v1_schema_and_enables_fts5_trigram() {
    let db = Database::open_in_memory().unwrap();

    assert_eq!(db.schema_version().unwrap(), 1);
    assert!(db.has_table("bookmarks").unwrap());
    assert!(db.has_table("tags").unwrap());
    assert!(db.has_table("bookmark_tags").unwrap());
    assert!(db.has_table("bookmarks_fts").unwrap());
    db.assert_fts5_trigram().unwrap();
}

#[test]
fn rejects_database_newer_than_supported_schema() {
    let db = Database::open_in_memory().unwrap();
    db.set_user_version_for_test(2).unwrap();

    let error = db.verify_supported_version().unwrap_err();

    assert_eq!(error.code(), "unsupported_schema_version");
}

fn repository() -> (Arc<Database>, SqliteBookmarkRepository) {
    let database = Arc::new(Database::open_in_memory().unwrap());
    let repository = SqliteBookmarkRepository::new(Arc::clone(&database));
    (database, repository)
}

fn bookmark(url: &str, tags: &[&str]) -> CreateBookmark {
    CreateBookmark {
        url: url.to_owned(),
        title: " Example ".to_owned(),
        description: "Description".to_owned(),
        tags: tags.iter().map(|tag| (*tag).to_owned()).collect(),
    }
}

#[test]
fn repository_create_round_trips_bookmark_and_tags() {
    let (_, repository) = repository();

    let created = repository
        .create(bookmark(
            " https://example.com/path?x=One#Part ",
            &[" rust ", "中文", "rust", ""],
        ))
        .unwrap();

    assert_eq!(created.url, "https://example.com/path?x=One#Part");
    assert_eq!(created.title, "Example");
    assert_eq!(created.tags, vec!["rust", "中文"]);
    assert_eq!(
        repository.get_by_id(created.id).unwrap(),
        Some(created.clone())
    );
    assert_eq!(repository.get_by_url(&created.url).unwrap(), Some(created));
}

#[test]
fn repository_duplicate_url_returns_stable_conflict_code() {
    let (_, repository) = repository();
    repository
        .create(bookmark("https://example.com", &[]))
        .unwrap();

    let error = repository
        .create(bookmark("https://example.com", &[]))
        .unwrap_err();

    assert_eq!(error.code(), "bookmark_url_conflict");
}

#[test]
fn repository_rejects_comma_in_tag_names() {
    let (_, repository) = repository();

    let error = repository
        .create(bookmark("https://example.com", &["a,b"]))
        .unwrap_err();

    assert_eq!(error.code(), "validation_error");
}

#[test]
fn repository_update_replaces_complete_tag_set() {
    let (_, repository) = repository();
    let created = repository
        .create(bookmark("https://example.com", &["old", "shared"]))
        .unwrap();

    let updated = repository
        .update(
            created.id,
            UpdateBookmark {
                title: Some("Updated".to_owned()),
                tags: Some(vec!["new".to_owned(), " shared ".to_owned()]),
                ..UpdateBookmark::default()
            },
        )
        .unwrap();

    assert_eq!(updated.title, "Updated");
    assert_eq!(updated.tags, vec!["new", "shared"]);
    assert_eq!(
        repository.get_tags().unwrap(),
        vec![
            bkmrx_lib::bookmarks::TagSummary {
                name: "new".to_owned(),
                count: 1,
            },
            bkmrx_lib::bookmarks::TagSummary {
                name: "shared".to_owned(),
                count: 1,
            },
        ]
    );
}

#[test]
fn repository_delete_cascades_relations_and_fts() {
    let (database, repository) = repository();
    let created = repository
        .create(bookmark("https://example.com", &["tag"]))
        .unwrap();

    assert_eq!(repository.delete_many(&[created.id]).unwrap(), 1);

    assert_eq!(repository.get_by_id(created.id).unwrap(), None);
    assert_eq!(
        database
            .query_i64_for_test("SELECT count(*) FROM bookmark_tags")
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

#[test]
fn repository_record_access_does_not_change_updated_at() {
    let (_, repository) = repository();
    let created = repository
        .create(bookmark("https://example.com", &[]))
        .unwrap();

    let accessed = repository.record_access(created.id).unwrap();

    assert_eq!(accessed.access_count, 1);
    assert!(accessed.accessed_at.is_some());
    assert_eq!(accessed.updated_at, created.updated_at);
}

#[test]
fn repository_get_by_ids_preserves_input_order() {
    let (_, repository) = repository();
    let first = repository
        .create(bookmark("https://example.com/1", &[]))
        .unwrap();
    let second = repository
        .create(bookmark("https://example.com/2", &[]))
        .unwrap();

    let bookmarks = repository
        .get_by_ids_ordered(&[second.id, first.id])
        .unwrap();

    assert_eq!(
        bookmarks
            .iter()
            .map(|bookmark| bookmark.id)
            .collect::<Vec<_>>(),
        vec![second.id, first.id]
    );
}

#[test]
fn repository_failed_write_rolls_back_bookmark_tags_and_fts() {
    let (database, repository) = repository();
    let created = repository
        .create(bookmark("https://example.com", &["original"]))
        .unwrap();
    database
        .execute_batch_for_test(
            "CREATE TRIGGER reject_replacement_tag
             BEFORE INSERT ON tags
             WHEN NEW.name = 'replacement'
             BEGIN
                 SELECT RAISE(ABORT, 'forced write failure');
             END;",
        )
        .unwrap();

    let error = repository
        .update(
            created.id,
            UpdateBookmark {
                title: Some("Must roll back".to_owned()),
                tags: Some(vec!["replacement".to_owned()]),
                ..UpdateBookmark::default()
            },
        )
        .unwrap_err();

    assert_eq!(error.code(), "database_error");
    assert_eq!(
        repository.get_by_id(created.id).unwrap(),
        Some(created.clone())
    );
    assert_eq!(
        repository.get_tags().unwrap(),
        vec![bkmrx_lib::bookmarks::TagSummary {
            name: "original".to_owned(),
            count: 1,
        }]
    );
    assert_eq!(
        database
            .query_i64_for_test(
                "SELECT count(*) FROM bookmarks_fts
                 WHERE bookmarks_fts MATCH 'Example'"
            )
            .unwrap(),
        1
    );
    assert_eq!(
        database
            .query_i64_for_test(
                "SELECT count(*) FROM bookmarks_fts
                 WHERE bookmarks_fts MATCH 'Must'"
            )
            .unwrap(),
        0
    );
}

#[test]
fn repository_rebuild_search_index_restores_missing_document() {
    let (database, repository) = repository();
    let created = repository
        .create(bookmark("https://example.com", &["中文"]))
        .unwrap();
    database
        .execute_batch_for_test(&format!(
            "DELETE FROM bookmarks_fts WHERE rowid = {}",
            created.id
        ))
        .unwrap();

    repository.rebuild_search_index().unwrap();

    assert_eq!(
        database
            .query_i64_for_test("SELECT count(*) FROM bookmarks_fts")
            .unwrap(),
        1
    );
}
