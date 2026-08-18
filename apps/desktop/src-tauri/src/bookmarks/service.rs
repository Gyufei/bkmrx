use std::{
    path::{Path, PathBuf},
    sync::Arc,
};

use super::{
    AppResult, Bookmark, BookmarkPage, BookmarkPageRequest, BookmarkRepository, BookmarkSearch,
    CreateBookmark, ImportPreview, SqliteBookmarkRepository, SqliteFtsSearch, TagQueryRequest,
    TagSummary, UpdateBookmark,
};

type ChangeNotifier = Arc<dyn Fn() + Send + Sync>;
type AccessNotifier = Arc<dyn Fn(&Bookmark) + Send + Sync>;

pub struct BookmarkService<R, S> {
    repository: R,
    search: S,
    notify_changed: ChangeNotifier,
    notify_accessed: AccessNotifier,
}

impl<R, S> BookmarkService<R, S> {
    pub fn new(repository: R, search: S) -> Self {
        Self {
            repository,
            search,
            notify_changed: Arc::new(|| {}),
            notify_accessed: Arc::new(|_| {}),
        }
    }

    pub fn with_change_notifier(mut self, notify_changed: ChangeNotifier) -> Self {
        self.notify_changed = notify_changed;
        self
    }

    pub fn with_access_notifier(mut self, notify_accessed: AccessNotifier) -> Self {
        self.notify_accessed = notify_accessed;
        self
    }
}

impl<R: BookmarkRepository, S: BookmarkSearch> BookmarkService<R, S> {
    pub fn query(&self, request: BookmarkPageRequest) -> AppResult<BookmarkPage> {
        let hits = self.search.search(&request)?;
        let items = self.repository.get_by_ids_ordered(&hits.bookmark_ids)?;
        Ok(BookmarkPage {
            items,
            next_cursor: hits.next_cursor,
        })
    }

    pub fn create(&self, input: CreateBookmark) -> AppResult<Bookmark> {
        let bookmark = self.repository.create(input)?;
        (self.notify_changed)();
        Ok(bookmark)
    }

    pub fn update(&self, id: i64, input: UpdateBookmark) -> AppResult<Bookmark> {
        let bookmark = self.repository.update(id, input)?;
        (self.notify_changed)();
        Ok(bookmark)
    }

    pub fn delete_many(&self, ids: Vec<i64>) -> AppResult<u64> {
        let deleted = self.repository.delete_many(&ids)?;
        if deleted > 0 {
            (self.notify_changed)();
        }
        Ok(deleted)
    }

    pub fn get_by_id(&self, id: i64) -> AppResult<Bookmark> {
        self.repository
            .get_by_id(id)?
            .ok_or_else(|| super::AppError::bookmark_not_found(id))
    }

    pub fn get_by_url(&self, url: String) -> AppResult<Option<Bookmark>> {
        self.repository.get_by_url(url.trim())
    }

    pub fn get_tags(&self, request: TagQueryRequest) -> AppResult<Vec<TagSummary>> {
        self.repository.get_tags(&request)
    }

    pub fn record_access(&self, id: i64) -> AppResult<Bookmark> {
        let bookmark = self.repository.record_access(id)?;
        (self.notify_accessed)(&bookmark);
        Ok(bookmark)
    }

    pub fn set_starred(&self, id: i64, starred: bool) -> AppResult<Bookmark> {
        let bookmark = self.repository.set_starred(id, starred)?;
        (self.notify_changed)();
        Ok(bookmark)
    }
}

pub type SharedBookmarkService = Arc<BookmarkService<SqliteBookmarkRepository, SqliteFtsSearch>>;

impl BookmarkService<SqliteBookmarkRepository, SqliteFtsSearch> {
    pub fn export_bookmarks(&self, directory: impl AsRef<Path>) -> AppResult<PathBuf> {
        super::transfer::export_bookmarks(self.repository.database(), directory.as_ref())
    }

    pub fn preview_bookmark_import(&self, path: impl AsRef<Path>) -> AppResult<ImportPreview> {
        super::transfer::preview_import(self.repository.database(), path.as_ref())
    }

    pub fn apply_bookmark_import(
        &self,
        path: impl AsRef<Path>,
        file_hash: &str,
    ) -> AppResult<ImportPreview> {
        let preview =
            super::transfer::apply_import(self.repository.database(), path.as_ref(), file_hash)?;
        if preview.total > 0 {
            (self.notify_changed)();
        }
        Ok(preview)
    }
}
