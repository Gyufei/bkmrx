use std::{
    path::{Path, PathBuf},
    sync::Arc,
};

use crate::{
    database::Database,
    error::{AppError, AppResult},
    logging::observe_database,
};

use super::{
    repository::{hydrate_ordered, SqliteBookmarkRepository},
    search::SqliteFtsSearch,
    Bookmark, BookmarkPage, BookmarkPageRequest, CreateBookmark, ImportPreview, TagQueryRequest,
    TagSummary, UpdateBookmark,
};

pub trait BookmarkEvents: Send + Sync {
    fn changed(&self);
    fn accessed(&self, bookmark: &Bookmark);
}

#[derive(Default)]
struct NoopBookmarkEvents;

impl BookmarkEvents for NoopBookmarkEvents {
    fn changed(&self) {}
    fn accessed(&self, _bookmark: &Bookmark) {}
}

pub struct BookmarkStore {
    database: Arc<Database>,
    repository: SqliteBookmarkRepository,
    search: SqliteFtsSearch,
    events: Arc<dyn BookmarkEvents>,
}

impl BookmarkStore {
    pub fn new(database: Arc<Database>) -> Self {
        Self {
            repository: SqliteBookmarkRepository::new(Arc::clone(&database)),
            search: SqliteFtsSearch,
            database,
            events: Arc::new(NoopBookmarkEvents),
        }
    }

    pub fn with_events(mut self, events: Arc<dyn BookmarkEvents>) -> Self {
        self.events = events;
        self
    }

    pub fn query(&self, request: BookmarkPageRequest) -> AppResult<BookmarkPage> {
        observe_database("bookmarks", "query", || {
            self.database.snapshot(|transaction| {
                let hits = self.search.search_with_connection(transaction, &request)?;
                let items = hydrate_ordered(transaction, &hits.bookmark_ids)?;
                Ok(BookmarkPage {
                    items,
                    next_cursor: hits.next_cursor,
                })
            })
        })
    }

    pub fn get(&self, id: i64) -> AppResult<Bookmark> {
        observe_database("bookmarks", "get_by_id", || {
            self.repository
                .get_by_id(id)?
                .ok_or_else(|| AppError::bookmark_not_found(id))
        })
    }

    pub fn find_by_url(&self, url: impl AsRef<str>) -> AppResult<Option<Bookmark>> {
        observe_database("bookmarks", "get_by_url", || {
            self.repository.get_by_url(url.as_ref())
        })
    }

    pub fn tags(&self, request: TagQueryRequest) -> AppResult<Vec<TagSummary>> {
        observe_database("bookmarks", "get_tags", || {
            self.repository.get_tags(&request)
        })
    }

    pub fn create(&self, input: CreateBookmark) -> AppResult<Bookmark> {
        observe_database("bookmarks", "create", || {
            let bookmark = self.repository.create(input)?;
            self.events.changed();
            Ok(bookmark)
        })
    }

    pub fn update(&self, id: i64, input: UpdateBookmark) -> AppResult<Bookmark> {
        observe_database("bookmarks", "update", || {
            let bookmark = self.repository.update(id, input)?;
            self.events.changed();
            Ok(bookmark)
        })
    }

    pub fn delete(&self, id: i64) -> AppResult<()> {
        observe_database("bookmarks", "delete", || {
            self.repository.delete(id)?;
            self.events.changed();
            Ok(())
        })
    }

    pub fn delete_many(&self, ids: &[i64]) -> AppResult<u64> {
        observe_database("bookmarks", "delete_many", || {
            let deleted = self.repository.delete_many(ids)?;
            if deleted > 0 {
                self.events.changed();
            }
            Ok(deleted)
        })
    }

    pub fn record_access(&self, id: i64) -> AppResult<Bookmark> {
        observe_database("bookmarks", "record_access", || {
            let bookmark = self.repository.record_access(id)?;
            self.events.accessed(&bookmark);
            Ok(bookmark)
        })
    }

    pub fn set_starred(&self, id: i64, starred: bool) -> AppResult<Bookmark> {
        observe_database("bookmarks", "set_starred", || {
            let bookmark = self.repository.set_starred(id, starred)?;
            self.events.changed();
            Ok(bookmark)
        })
    }

    pub fn export(&self, destination: impl AsRef<Path>) -> AppResult<PathBuf> {
        observe_database("bookmarks", "export", || {
            super::transfer::export_bookmarks(&self.database, destination.as_ref())
        })
    }

    pub fn preview_import(&self, source: impl AsRef<Path>) -> AppResult<ImportPreview> {
        observe_database("bookmarks", "preview_import", || {
            super::transfer::preview_import(&self.database, source.as_ref())
        })
    }

    pub fn apply_import(
        &self,
        source: impl AsRef<Path>,
        expected_hash: &str,
    ) -> AppResult<ImportPreview> {
        observe_database("bookmarks", "apply_import", || {
            let outcome =
                super::transfer::apply_import(&self.database, source.as_ref(), expected_hash)?;
            if outcome.total > 0 {
                self.events.changed();
            }
            Ok(outcome)
        })
    }
}

pub type SharedBookmarkStore = Arc<BookmarkStore>;
