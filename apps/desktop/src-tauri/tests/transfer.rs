use std::{fs, sync::Arc};

use bkmrx_lib::{
    bookmarks::{BookmarkStore, CreateBookmark},
    database::Database,
    navigation::{AddNavigationBookmarks, CreateNavigationCategory, NavigationStore},
};
use serde_json::{json, Value};
use tempfile::TempDir;

fn stores() -> (Arc<Database>, BookmarkStore, NavigationStore) {
    let database = Arc::new(Database::open_in_memory().unwrap());
    let bookmarks = BookmarkStore::new(Arc::clone(&database));
    let navigation = NavigationStore::new(Arc::clone(&database));
    (database, bookmarks, navigation)
}

fn populated_dataset() -> (TempDir, std::path::PathBuf, Value) {
    let (_, bookmarks, navigation) = stores();
    let bookmark = bookmarks
        .create(CreateBookmark {
            url: "https://example.com".into(),
            title: "Example".into(),
            description: "Description".into(),
            tags: vec!["reference".into()],
        })
        .unwrap();
    let category = navigation
        .create_category(CreateNavigationCategory {
            name: "工具".into(),
        })
        .unwrap();
    navigation
        .add_bookmarks(
            category.id,
            AddNavigationBookmarks {
                bookmark_ids: vec![bookmark.id],
            },
        )
        .unwrap();
    let directory = TempDir::new().unwrap();
    let path = bookmarks.export(directory.path()).unwrap();
    let value = serde_json::from_slice(&fs::read(&path).unwrap()).unwrap();
    (directory, path, value)
}

#[test]
fn exports_v2_with_uuid_entities_and_relationships_only() {
    let (_directory, _path, value) = populated_dataset();
    assert_eq!(value["format_version"], 2);
    assert!(value["bookmarks"][0]["id"].is_string());
    assert!(value["tags"][0]["id"].is_string());
    assert!(value["bookmark_tag_relations"][0]["bookmark_id"].is_string());
    assert!(value["navigation_categories"][0]["id"].is_string());
    assert!(value["navigation_placements"][0]["id"].is_string());
    for excluded in ["todos", "rss_feeds", "notes", "settings", "favicons"] {
        assert!(value.get(excluded).is_none());
    }
}

#[test]
fn round_trip_preserves_entity_and_relationship_ids() {
    let (_directory, path, source) = populated_dataset();
    let (_, target, navigation) = stores();
    assert!(target.initialization_status().unwrap().can_initialize);
    let result = target.initialize(&path).unwrap();
    assert_eq!(
        (result.bookmark_count, result.navigation_category_count),
        (1, 1)
    );
    let directory = TempDir::new().unwrap();
    let target_path = target.export(directory.path()).unwrap();
    let restored: Value = serde_json::from_slice(&fs::read(target_path).unwrap()).unwrap();
    for key in [
        "bookmarks",
        "tags",
        "bookmark_tag_relations",
        "navigation_categories",
        "navigation_placements",
    ] {
        assert_eq!(
            restored[key], source[key],
            "{key} changed during initialization"
        );
    }
    assert_eq!(navigation.list_sections().unwrap()[0].cards.len(), 1);
}

#[test]
fn initialization_requires_an_empty_bookmark_domain() {
    let (_directory, path, _) = populated_dataset();
    let (_, target, _) = stores();
    target
        .create(CreateBookmark {
            url: "https://local.example".into(),
            title: "Local".into(),
            description: String::new(),
            tags: vec![],
        })
        .unwrap();
    assert!(!target.initialization_status().unwrap().can_initialize);
    assert_eq!(
        target.initialize(path).unwrap_err().code(),
        "import_validation_failed"
    );
    assert!(target
        .find_by_url("https://local.example")
        .unwrap()
        .is_some());
}

#[test]
fn rejects_v1_and_dangling_relationships_before_writing() {
    let directory = TempDir::new().unwrap();
    let v1 = directory.path().join("v1.json");
    fs::write(
        &v1,
        serde_json::to_vec(&json!({"format_version": 1, "bookmarks": []})).unwrap(),
    )
    .unwrap();
    let (_, target, _) = stores();
    assert_eq!(
        target.initialize(&v1).unwrap_err().code(),
        "unsupported_import_format"
    );

    let (_source_directory, _source_path, mut value) = populated_dataset();
    value["bookmark_tag_relations"][0]["bookmark_id"] =
        json!("018f0000-0000-7000-8000-000000000099");
    let dangling = directory.path().join("dangling.json");
    fs::write(&dangling, serde_json::to_vec(&value).unwrap()).unwrap();
    assert_eq!(
        target.initialize(dangling).unwrap_err().code(),
        "import_validation_failed"
    );
    assert!(target.initialization_status().unwrap().can_initialize);
}

#[test]
fn write_failure_rolls_back_every_entity_and_relation() {
    let (_directory, path, _) = populated_dataset();
    let (database, target, _) = stores();
    database.execute_batch_for_test("CREATE TRIGGER reject_placements BEFORE INSERT ON navigation_placements BEGIN SELECT RAISE(ABORT, 'forced failure'); END;").unwrap();
    assert!(target.initialize(path).is_err());
    assert!(target.initialization_status().unwrap().can_initialize);
    assert!(target.find_by_url("https://example.com").unwrap().is_none());
}
