use std::sync::Arc;

use bkmrx_lib::{
    bookmarks::{
        BookmarkPageRequest, BookmarkRepository, BookmarkSearch, CreateBookmark,
        SqliteBookmarkRepository, SqliteFtsSearch,
    },
    database::Database,
};

struct Fixture {
    database: Arc<Database>,
    search: SqliteFtsSearch,
    ids: Vec<i64>,
}

fn fixture() -> Fixture {
    let database = Arc::new(Database::open_in_memory().unwrap());
    let repository = SqliteBookmarkRepository::new(Arc::clone(&database));
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
            repository
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
                "UPDATE bookmarks SET updated_at = {} WHERE id = {}",
                1_700_000_000 + position,
                id
            ))
            .unwrap();
    }

    Fixture {
        search: SqliteFtsSearch::new(Arc::clone(&database)),
        database,
        ids,
    }
}

fn request(query: &str, tags: &[&str], page_size: u32) -> BookmarkPageRequest {
    BookmarkPageRequest {
        query: query.to_owned(),
        tags: tags.iter().map(|tag| (*tag).to_owned()).collect(),
        cursor: None,
        page_size,
    }
}

#[test]
fn empty_query_pages_by_updated_at_then_id() {
    let fixture = fixture();

    let page = fixture.search.search(&request("", &[], 3)).unwrap();

    assert_eq!(
        page.bookmark_ids,
        vec![fixture.ids[6], fixture.ids[5], fixture.ids[4]]
    );
    assert!(page.next_cursor.is_some());
}

#[test]
fn tag_filter_requires_all_selected_tags() {
    let fixture = fixture();

    let page = fixture
        .search
        .search(&request("", &["search", "rust"], 50))
        .unwrap();

    assert_eq!(page.bookmark_ids, vec![fixture.ids[6], fixture.ids[5]]);
}

#[test]
fn one_character_chinese_query_uses_like() {
    let fixture = fixture();

    let page = fixture.search.search(&request("中", &[], 50)).unwrap();

    assert_eq!(page.bookmark_ids.len(), 2);
    assert!(page.bookmark_ids.contains(&fixture.ids[0]));
    assert!(page.bookmark_ids.contains(&fixture.ids[1]));
}

#[test]
fn two_character_chinese_query_uses_like() {
    let fixture = fixture();

    let page = fixture.search.search(&request("中文", &[], 50)).unwrap();

    assert_eq!(page.bookmark_ids.len(), 2);
    assert!(page.bookmark_ids.contains(&fixture.ids[0]));
    assert!(page.bookmark_ids.contains(&fixture.ids[1]));
}

#[test]
fn three_character_chinese_query_uses_trigram() {
    let fixture = fixture();

    let page = fixture.search.search(&request("中文搜", &[], 50)).unwrap();

    assert_eq!(page.bookmark_ids, vec![fixture.ids[1]]);
}

#[test]
fn special_characters_never_raise_fts_syntax_errors() {
    let fixture = fixture();

    for query in ["%", "_", "\" OR *", "hello-world", "q=hello"] {
        fixture.search.search(&request(query, &[], 50)).unwrap();
    }
}

#[test]
fn text_and_tags_compose() {
    let fixture = fixture();

    let page = fixture
        .search
        .search(&request("中文", &["search"], 50))
        .unwrap();

    assert_eq!(page.bookmark_ids, vec![fixture.ids[1]]);
}

#[test]
fn page_size_is_limited_to_one_through_one_hundred() {
    let fixture = fixture();

    assert_eq!(
        fixture
            .search
            .search(&request("", &[], 0))
            .unwrap_err()
            .code(),
        "validation_error"
    );
    assert_eq!(
        fixture
            .search
            .search(&request("", &[], 101))
            .unwrap_err()
            .code(),
        "validation_error"
    );
}

#[test]
fn cursor_is_bound_to_query_and_sorted_tags() {
    let fixture = fixture();
    let first = fixture
        .search
        .search(&request("", &["rust", "search"], 1))
        .unwrap();
    let cursor = first.next_cursor.unwrap();

    let mut reordered = request("", &["search", "rust"], 1);
    reordered.cursor = Some(cursor.clone());
    fixture.search.search(&reordered).unwrap();

    let mut changed = request("", &["search"], 1);
    changed.cursor = Some(cursor);
    assert_eq!(
        fixture.search.search(&changed).unwrap_err().code(),
        "invalid_cursor"
    );
}

#[test]
fn pages_contain_no_duplicates_or_omissions() {
    let fixture = fixture();
    let mut request = request("", &[], 2);
    let mut ids = Vec::new();

    loop {
        let page = fixture.search.search(&request).unwrap();
        ids.extend(page.bookmark_ids);
        match page.next_cursor {
            Some(cursor) => request.cursor = Some(cursor),
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
