use std::sync::Arc;

use bkmrx_lib::{
    bookmarks::{BookmarkStore, CreateBookmark},
    database::Database,
    identity::NavigationCategoryId,
    navigation::{
        AddNavigationBookmarks, CreateNavigationCategory, NavigationStore,
        ReorderNavigationCategories, UpdateNavigationCategory,
    },
};

fn store() -> NavigationStore {
    NavigationStore::new(Arc::new(Database::open_in_memory().unwrap()))
}

#[test]
fn category_lifecycle_normalizes_names_and_appends_order() {
    let store = store();
    let tools = store
        .create_category(CreateNavigationCategory {
            name: "  工具  ".into(),
        })
        .unwrap();
    let blogs = store
        .create_category(CreateNavigationCategory {
            name: "博客".into(),
        })
        .unwrap();
    assert_eq!((tools.name.as_str(), tools.order), ("工具", 0));
    assert_eq!(blogs.order, 1);

    let renamed = store
        .update_category(
            tools.id,
            UpdateNavigationCategory {
                name: "常用工具".into(),
            },
        )
        .unwrap();
    assert_eq!(renamed.name, "常用工具");
    assert_eq!(renamed.order, 0);

    store.delete_category(tools.id).unwrap();
    assert_eq!(store.list_sections().unwrap()[0].category, blogs);
}

#[test]
fn category_names_are_unique_after_trim_and_case_normalization() {
    let store = store();
    store
        .create_category(CreateNavigationCategory {
            name: "Tools".into(),
        })
        .unwrap();
    let error = store
        .create_category(CreateNavigationCategory {
            name: " tools ".into(),
        })
        .unwrap_err();
    assert_eq!(error.code(), "navigation_category_conflict");
}

#[test]
fn categories_can_be_reordered_as_one_complete_sequence() {
    let store = store();
    let first = store
        .create_category(CreateNavigationCategory { name: "一".into() })
        .unwrap();
    let second = store
        .create_category(CreateNavigationCategory { name: "二".into() })
        .unwrap();
    let third = store
        .create_category(CreateNavigationCategory { name: "三".into() })
        .unwrap();

    store
        .reorder_categories(ReorderNavigationCategories {
            category_ids: vec![third.id, first.id, second.id],
        })
        .unwrap();

    let categories = store
        .list_sections()
        .unwrap()
        .into_iter()
        .map(|section| section.category)
        .collect::<Vec<_>>();
    assert_eq!(
        categories
            .iter()
            .map(|category| category.id)
            .collect::<Vec<_>>(),
        vec![third.id, first.id, second.id]
    );
    assert_eq!(
        categories
            .iter()
            .map(|category| category.order)
            .collect::<Vec<_>>(),
        vec![0, 1, 2]
    );
}

#[test]
fn reorder_rejects_incomplete_and_duplicate_category_ids_without_changes() {
    let store = store();
    let first = store
        .create_category(CreateNavigationCategory { name: "一".into() })
        .unwrap();
    let second = store
        .create_category(CreateNavigationCategory { name: "二".into() })
        .unwrap();

    for category_ids in [vec![first.id], vec![first.id, first.id]] {
        assert_eq!(
            store
                .reorder_categories(ReorderNavigationCategories { category_ids })
                .unwrap_err()
                .code(),
            "validation_error"
        );
    }
    let ids = store
        .list_sections()
        .unwrap()
        .into_iter()
        .map(|section| section.category.id)
        .collect::<Vec<_>>();
    assert_eq!(ids, vec![first.id, second.id]);
}

#[test]
fn missing_and_empty_categories_return_stable_errors() {
    let store = store();
    assert_eq!(
        store
            .create_category(CreateNavigationCategory { name: "  ".into() })
            .unwrap_err()
            .code(),
        "validation_error"
    );
    assert_eq!(
        store
            .delete_category(NavigationCategoryId::new())
            .unwrap_err()
            .code(),
        "navigation_category_not_found"
    );
}

#[test]
fn placements_are_ordered_unique_and_can_span_categories() {
    let database = Arc::new(Database::open_in_memory().unwrap());
    let bookmark_store = BookmarkStore::new(Arc::clone(&database));
    let first = bookmark_store
        .create(CreateBookmark {
            url: "https://one.example".into(),
            title: "One".into(),
            description: String::new(),
            tags: vec![],
        })
        .unwrap()
        .id;
    let second = bookmark_store
        .create(CreateBookmark {
            url: "https://two.example".into(),
            title: "Two".into(),
            description: String::new(),
            tags: vec![],
        })
        .unwrap()
        .id;
    let store = NavigationStore::new(database);
    let tools = store
        .create_category(CreateNavigationCategory {
            name: "工具".into(),
        })
        .unwrap();
    let daily = store
        .create_category(CreateNavigationCategory {
            name: "常用".into(),
        })
        .unwrap();

    let placements = store
        .add_bookmarks(
            tools.id,
            AddNavigationBookmarks {
                bookmark_ids: vec![first, second],
            },
        )
        .unwrap();
    assert_eq!(
        placements
            .iter()
            .map(|item| item.bookmark_id)
            .collect::<Vec<_>>(),
        vec![first, second]
    );
    assert!(placements[0].placement_id < placements[1].placement_id);
    store
        .add_bookmarks(
            daily.id,
            AddNavigationBookmarks {
                bookmark_ids: vec![first],
            },
        )
        .unwrap();
    assert_eq!(
        store.list_sections().unwrap()[1].cards[0].bookmark_id,
        first
    );

    let duplicate = store
        .add_bookmarks(
            tools.id,
            AddNavigationBookmarks {
                bookmark_ids: vec![first],
            },
        )
        .unwrap_err();
    assert_eq!(duplicate.code(), "validation_error");
    store.remove_bookmark(tools.id, first).unwrap();
    assert_eq!(store.list_sections().unwrap()[0].cards.len(), 1);
}

#[test]
fn deleting_a_category_cascades_placements_but_preserves_bookmarks() {
    let database = Arc::new(Database::open_in_memory().unwrap());
    let bookmark_store = BookmarkStore::new(Arc::clone(&database));
    let bookmark_id = bookmark_store
        .create(CreateBookmark {
            url: "https://keep.example".into(),
            title: "Keep".into(),
            description: String::new(),
            tags: vec![],
        })
        .unwrap()
        .id;
    let store = NavigationStore::new(Arc::clone(&database));
    let category = store
        .create_category(CreateNavigationCategory {
            name: "临时".into(),
        })
        .unwrap();
    store
        .add_bookmarks(
            category.id,
            AddNavigationBookmarks {
                bookmark_ids: vec![bookmark_id],
            },
        )
        .unwrap();
    store.delete_category(category.id).unwrap();

    assert_eq!(bookmark_store.get(bookmark_id).unwrap().title, "Keep");
}
