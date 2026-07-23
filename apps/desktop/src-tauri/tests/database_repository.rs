use bkmrx_lib::database::Database;

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
