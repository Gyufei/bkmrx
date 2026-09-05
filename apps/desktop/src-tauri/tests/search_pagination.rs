use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::Arc;

use bkmrx_lib::{
    bookmarks::{
        Bookmark, BookmarkEvents, BookmarkPage, BookmarkPageRequest, BookmarkStore, CreateBookmark,
        UpdateBookmark,
    },
    database::Database,
};

struct Fixture {
    database: Arc<Database>,
    store: BookmarkStore,
    ids: Vec<i64>,
}

fn fixture() -> Fixture {
    let database = Arc::new(Database::open_in_memory().unwrap());
    let store = BookmarkStore::new(Arc::clone(&database));
    let inputs = [
        (
            "https://example.com/china",
            "中国开发指南",
            "Rust 与数据库",
            vec!["rust", "中文"],
        ),
        (
            "https://example.com/search",
            "中文搜索实践",
            "trigram 全文检索",
            vec!["search", "中文"],
        ),
        (
            "https://rust-lang.org/",
            "Rust guide",
            "systems programming",
            vec!["rust"],
        ),
        (
            "https://example.com/percent",
            "100%_safe",
            "special punctuation",
            vec!["symbols"],
        ),
        (
            "https://example.com/query?q=hello-world",
            "URL punctuation",
            "query fragment",
            vec!["web"],
        ),
        (
            "https://example.com/shared",
            "Shared tags",
            "both selected tags",
            vec!["rust", "search"],
        ),
        (
            "https://example.com/shared-again",
            "Shared tags again",
            "second bookmark with both selected tags",
            vec!["search", "rust"],
        ),
    ];
    let ids = inputs
        .into_iter()
        .map(|(url, title, description, tags)| {
            store
                .create(CreateBookmark {
                    url: url.to_owned(),
                    title: title.to_owned(),
                    description: description.to_owned(),
                    tags: tags.into_iter().map(str::to_owned).collect(),
                })
                .unwrap()
                .id
        })
        .collect::<Vec<_>>();
    for (position, id) in ids.iter().enumerate() {
        database
            .execute_batch_for_test(&format!(
                "UPDATE bookmarks SET updated_at = {}, starred_at = {} WHERE id = {}",
                1_700_000_000 + position,
                1_700_000_000 + position,
                id
            ))
            .unwrap();
    }

    Fixture {
        store,
        database,
        ids,
    }
}

fn page_ids(page: &BookmarkPage) -> Vec<i64> {
    page.items.iter().map(|bookmark| bookmark.id).collect()
}

fn request(query: &str, tags: &[&str], page_size: u32) -> BookmarkPageRequest {
    BookmarkPageRequest::Search {
        query: query.to_owned(),
        tags: tags.iter().map(|tag| (*tag).to_owned()).collect(),
        cursor: None,
        page_size,
    }
}

fn starred_request(page_size: u32) -> BookmarkPageRequest {
    BookmarkPageRequest::Browse {
        starred: true,
        cursor: None,
        page_size,
    }
}

fn with_cursor(mut request: BookmarkPageRequest, cursor: String) -> BookmarkPageRequest {
    match &mut request {
        BookmarkPageRequest::Browse {
            cursor: request_cursor,
            ..
        }
        | BookmarkPageRequest::Search {
            cursor: request_cursor,
            ..
        } => *request_cursor = Some(cursor),
        BookmarkPageRequest::Random { .. } => panic!("random requests do not use cursors"),
    }
    request
}

#[test]
fn empty_query_without_tags_only_pages_starred_by_starred_at_then_id() {
    let fixture = fixture();
    fixture
        .database
        .execute_batch_for_test(&format!(
            "UPDATE bookmarks SET starred_at = NULL;
             UPDATE bookmarks SET starred_at = 100 WHERE id IN ({}, {});
             UPDATE bookmarks SET starred_at = 200 WHERE id = {};",
            fixture.ids[1], fixture.ids[2], fixture.ids[4]
        ))
        .unwrap();

    let page = fixture.store.query(starred_request(3)).unwrap();

    assert_eq!(
        page_ids(&page),
        vec![fixture.ids[4], fixture.ids[2], fixture.ids[1]]
    );
    assert!(page.next_cursor.is_none());
}

#[test]
fn tag_filter_requires_all_selected_tags() {
    let fixture = fixture();

    let page = fixture
        .store
        .query(request("", &["search", "rust"], 50))
        .unwrap();

    assert_eq!(page_ids(&page), vec![fixture.ids[6], fixture.ids[5]]);
}

#[test]
fn empty_query_with_tags_keeps_recent_tag_filter_behavior() {
    let fixture = fixture();

    let page = fixture
        .store
        .query(request("", &["search", "rust"], 50))
        .unwrap();

    assert_eq!(page_ids(&page), vec![fixture.ids[6], fixture.ids[5]]);
}

#[test]
fn one_character_chinese_query_uses_like() {
    let fixture = fixture();

    let page = fixture.store.query(request("中", &[], 50)).unwrap();

    let ids = page_ids(&page);
    assert_eq!(ids.len(), 2);
    assert!(ids.contains(&fixture.ids[0]));
    assert!(ids.contains(&fixture.ids[1]));
}

#[test]
fn two_character_chinese_query_uses_like() {
    let fixture = fixture();

    let page = fixture.store.query(request("中文", &[], 50)).unwrap();

    let ids = page_ids(&page);
    assert_eq!(ids.len(), 2);
    assert!(ids.contains(&fixture.ids[0]));
    assert!(ids.contains(&fixture.ids[1]));
}

#[test]
fn three_character_chinese_query_uses_trigram() {
    let fixture = fixture();

    let page = fixture.store.query(request("中文搜", &[], 50)).unwrap();

    assert_eq!(page_ids(&page), vec![fixture.ids[1]]);
}

#[test]
fn special_characters_never_raise_fts_syntax_errors() {
    let fixture = fixture();

    for query in ["%", "_", "\" OR *", "hello-world", "q=hello"] {
        fixture.store.query(request(query, &[], 50)).unwrap();
    }
}

#[test]
fn text_and_tags_compose() {
    let fixture = fixture();

    let page = fixture
        .store
        .query(request("中文", &["search"], 50))
        .unwrap();

    assert_eq!(page_ids(&page), vec![fixture.ids[1]]);
}

#[test]
fn page_size_is_limited_to_one_through_one_hundred() {
    let fixture = fixture();

    assert_eq!(
        fixture.store.query(request("", &[], 0)).unwrap_err().code(),
        "validation_error"
    );
    assert_eq!(
        fixture
            .store
            .query(request("", &[], 101))
            .unwrap_err()
            .code(),
        "validation_error"
    );
}

#[test]
fn random_request_returns_unique_items_without_a_cursor() {
    let fixture = fixture();
    let page = fixture
        .store
        .query(BookmarkPageRequest::Random { limit: 5 })
        .unwrap();

    let ids = page_ids(&page);
    assert_eq!(ids.len(), 5);
    assert_eq!(
        ids.iter()
            .copied()
            .collect::<std::collections::HashSet<_>>()
            .len(),
        5
    );
    assert!(ids.iter().all(|id| fixture.ids.contains(id)));
    assert_eq!(page.next_cursor, None);
}

#[test]
fn random_request_returns_all_items_when_limit_exceeds_the_collection() {
    let fixture = fixture();
    let page = fixture
        .store
        .query(BookmarkPageRequest::Random { limit: 7 })
        .unwrap();

    assert_eq!(page_ids(&page).len(), fixture.ids.len());
}

#[test]
fn bookmark_request_rejects_unknown_fields() {
    let request = serde_json::json!({
        "mode": "random",
        "limit": 7,
        "cursor": null
    });

    assert!(serde_json::from_value::<BookmarkPageRequest>(request).is_err());
}

#[test]
fn cursor_is_bound_to_query_and_sorted_tags() {
    let fixture = fixture();
    let first = fixture
        .store
        .query(request("", &["rust", "search"], 1))
        .unwrap();
    let cursor = first.next_cursor.unwrap();

    let reordered = with_cursor(request("", &["search", "rust"], 1), cursor.clone());
    fixture.store.query(reordered).unwrap();

    let changed = with_cursor(request("", &["search"], 1), cursor);
    assert_eq!(
        fixture.store.query(changed).unwrap_err().code(),
        "invalid_cursor"
    );
}

#[test]
fn pages_contain_no_duplicates_or_omissions() {
    let fixture = fixture();
    let mut request = starred_request(2);
    let mut ids = Vec::new();

    loop {
        let page = fixture.store.query(request.clone()).unwrap();
        ids.extend(page_ids(&page));
        match page.next_cursor {
            Some(cursor) => request = with_cursor(request, cursor),
            None => break,
        }
    }

    let mut expected = fixture.ids.clone();
    expected.reverse();
    assert_eq!(ids, expected);
    assert_eq!(
        ids.iter()
            .copied()
            .collect::<std::collections::HashSet<_>>()
            .len(),
        fixture.ids.len()
    );
    assert_eq!(
        fixture
            .database
            .query_i64_for_test("SELECT count(*) FROM bookmarks")
            .unwrap(),
        ids.len() as i64
    );
}

#[test]
fn service_query_hydrates_in_search_order_and_forwards_validation() {
    let fixture = fixture();
    let page = fixture.store.query(starred_request(3)).unwrap();

    assert_eq!(
        page.items
            .iter()
            .map(|bookmark| bookmark.id)
            .collect::<Vec<_>>(),
        vec![fixture.ids[6], fixture.ids[5], fixture.ids[4]]
    );
    assert_eq!(
        fixture.store.query(request("", &[], 0)).unwrap_err().code(),
        "validation_error"
    );
}

#[test]
fn service_maps_not_found_and_notifies_only_successful_mutations() {
    let database = Arc::new(Database::open_in_memory().unwrap());
    let notifications = Arc::new(AtomicUsize::new(0));
    let accesses = Arc::new(AtomicUsize::new(0));
    struct RecordingEvents {
        changed: Arc<AtomicUsize>,
        accessed: Arc<AtomicUsize>,
    }
    impl BookmarkEvents for RecordingEvents {
        fn changed(&self) {
            self.changed.fetch_add(1, Ordering::SeqCst);
        }
        fn accessed(&self, _bookmark: &Bookmark) {
            self.accessed.fetch_add(1, Ordering::SeqCst);
        }
    }
    let service = BookmarkStore::new(database).with_events(Arc::new(RecordingEvents {
        changed: Arc::clone(&notifications),
        accessed: Arc::clone(&accesses),
    }));

    assert_eq!(service.get(99).unwrap_err().code(), "bookmark_not_found");
    assert_eq!(notifications.load(Ordering::SeqCst), 0);

    let created = service
        .create(CreateBookmark {
            url: "https://example.com".to_owned(),
            title: "Example".to_owned(),
            description: String::new(),
            tags: vec!["one".to_owned()],
        })
        .unwrap();
    service
        .update(
            created.id,
            UpdateBookmark {
                title: Some("Updated".to_owned()),
                ..UpdateBookmark::default()
            },
        )
        .unwrap();
    service.set_starred(created.id, true).unwrap();
    service.record_access(created.id).unwrap();
    assert_eq!(
        service
            .create(CreateBookmark {
                url: "https://example.com".to_owned(),
                title: "Duplicate".to_owned(),
                description: String::new(),
                tags: Vec::new(),
            })
            .unwrap_err()
            .code(),
        "bookmark_url_conflict"
    );
    service.delete_many(&[created.id]).unwrap();
    service.delete_many(&[]).unwrap();

    assert_eq!(notifications.load(Ordering::SeqCst), 4);
    assert_eq!(accesses.load(Ordering::SeqCst), 1);
}
