use std::{collections::HashSet, sync::Arc};

use chrono::Utc;
use rusqlite::{params, OptionalExtension, Row};

use crate::{
    database::Database,
    error::{AppError, AppResult},
    identity::{BookmarkId, NavigationCategoryId, NavigationPlacementId},
    logging::observe_database,
};

use super::{
    AddNavigationBookmarks, CreateNavigationCategory, NavigationCategory, NavigationPlacementCard,
    NavigationSection, ReorderNavigationCategories, UpdateNavigationCategory,
};

type ChangeNotifier = Arc<dyn Fn() + Send + Sync>;

pub struct NavigationStore {
    database: Arc<Database>,
    notify_changed: ChangeNotifier,
}

impl NavigationStore {
    pub fn new(database: Arc<Database>) -> Self {
        Self {
            database,
            notify_changed: Arc::new(|| {}),
        }
    }

    pub fn with_change_notifier(mut self, notifier: ChangeNotifier) -> Self {
        self.notify_changed = notifier;
        self
    }

    pub fn list_sections(&self) -> AppResult<Vec<NavigationSection>> {
        observe_database("navigation", "list_sections", || {
            self.database.read(|connection| {
            let mut statement = connection.prepare(
                "SELECT id,name,\"order\",created_at,updated_at FROM navigation_categories ORDER BY \"order\",id",
            )?;
            let categories = statement
                .query_map([], category_from_row)?
                .collect::<Result<Vec<_>, _>>()?;
            categories
                .into_iter()
                .map(|category| {
                    let cards = list_cards(connection, category.id)?;
                    Ok(NavigationSection { category, cards })
                })
                .collect()
        })
        })
    }

    pub fn create_category(
        &self,
        input: CreateNavigationCategory,
    ) -> AppResult<NavigationCategory> {
        let name = normalized_name(&input.name)?;
        let id = NavigationCategoryId::new();
        let now = Utc::now().timestamp_millis();
        let result = observe_database("navigation", "create_category", || {
            self.database.write(|transaction| {
            let order: i64 = transaction.query_row("SELECT COALESCE(max(\"order\"),-1)+1 FROM navigation_categories", [], |row| row.get(0))?;
            transaction.execute(
                "INSERT INTO navigation_categories(id,name,\"order\",created_at,updated_at) VALUES(?1,?2,?3,?4,?4)",
                params![id,name,order,now],
            ).map_err(category_write_error)?;
            get(transaction, id)?.ok_or_else(|| AppError::internal_error("created navigation category could not be reloaded"))
        })
        });
        self.changed(result)
    }

    pub fn update_category(
        &self,
        id: NavigationCategoryId,
        input: UpdateNavigationCategory,
    ) -> AppResult<NavigationCategory> {
        let name = normalized_name(&input.name)?;
        let result = observe_database("navigation", "update_category", || {
            self.database.write(|transaction| {
                let changed = transaction
                    .execute(
                        "UPDATE navigation_categories SET name=?1,updated_at=?2 WHERE id=?3",
                        params![name, Utc::now().timestamp_millis(), id],
                    )
                    .map_err(category_write_error)?;
                if changed == 0 {
                    return Err(not_found(id));
                }
                get(transaction, id)?.ok_or_else(|| not_found(id))
            })
        });
        self.changed(result)
    }

    pub fn delete_category(&self, id: NavigationCategoryId) -> AppResult<()> {
        let result = observe_database("navigation", "delete_category", || {
            self.database.write(|transaction| {
                if transaction.execute("DELETE FROM navigation_categories WHERE id=?1", [id])? == 0
                {
                    return Err(not_found(id));
                }
                Ok(())
            })
        });
        self.changed(result)
    }

    pub fn reorder_categories(&self, input: ReorderNavigationCategories) -> AppResult<()> {
        let result = observe_database("navigation", "reorder_categories", || {
            self.database.write(|transaction| {
                let current = list_category_ids(transaction)?;
                validate_reorder(&current, &input.category_ids)?;
                let offset = reorder_offset(transaction, input.category_ids.len())?;
                transaction.execute(
                    "UPDATE navigation_categories SET \"order\"=\"order\"+?1",
                    [offset],
                )?;
                let now = Utc::now().timestamp_millis();
                for (order, id) in input.category_ids.into_iter().enumerate() {
                    let order = i64::try_from(order).map_err(|_| {
                        AppError::internal_error("Navigation category order overflow")
                    })?;
                    transaction.execute(
                        "UPDATE navigation_categories SET \"order\"=?1,updated_at=?2 WHERE id=?3",
                        params![order, now, id],
                    )?;
                }
                Ok(())
            })
        });
        self.changed(result)
    }

    pub fn add_bookmarks(
        &self,
        category_id: NavigationCategoryId,
        input: AddNavigationBookmarks,
    ) -> AppResult<Vec<NavigationPlacementCard>> {
        let result = observe_database("navigation", "add_bookmarks", || {
            self.database.write(|transaction| {
                ensure_category_exists(transaction, category_id)?;
                let now = Utc::now().timestamp_millis();
                for bookmark_id in input.bookmark_ids {
                    transaction
                        .execute(
                            "INSERT INTO navigation_placements(id,category_id,bookmark_id,created_at) VALUES(?1,?2,?3,?4)",
                            params![NavigationPlacementId::new(), category_id, bookmark_id, now],
                        )
                        .map_err(placement_write_error)?;
                }
                list_cards(transaction, category_id)
            })
        });
        self.changed(result)
    }

    pub fn remove_bookmark(
        &self,
        category_id: NavigationCategoryId,
        bookmark_id: BookmarkId,
    ) -> AppResult<()> {
        let result = observe_database("navigation", "remove_bookmark", || {
            self.database.write(|transaction| {
                let changed = transaction.execute(
                    "DELETE FROM navigation_placements WHERE category_id=?1 AND bookmark_id=?2",
                    params![category_id, bookmark_id],
                )?;
                if changed == 0 {
                    return Err(AppError::validation_error(
                        "Navigation placement was not found",
                    ));
                }
                Ok(())
            })
        });
        self.changed(result)
    }

    fn changed<T>(&self, result: AppResult<T>) -> AppResult<T> {
        if result.is_ok() {
            (self.notify_changed)();
        }
        result
    }
}

fn normalized_name(value: &str) -> AppResult<String> {
    let value = value.trim();
    if value.is_empty() {
        return Err(AppError::validation_error(
            "Navigation category name cannot be empty",
        ));
    }
    Ok(value.to_owned())
}

fn list_category_ids(connection: &rusqlite::Connection) -> AppResult<Vec<NavigationCategoryId>> {
    let mut statement = connection.prepare("SELECT id FROM navigation_categories")?;
    let ids = statement
        .query_map([], |row| row.get(0))?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(ids)
}

fn validate_reorder(
    current: &[NavigationCategoryId],
    requested: &[NavigationCategoryId],
) -> AppResult<()> {
    let unique = requested.iter().copied().collect::<HashSet<_>>();
    if requested.len() != current.len()
        || unique.len() != requested.len()
        || current.iter().any(|id| !unique.contains(id))
    {
        return Err(AppError::validation_error(
            "Navigation category order must contain every category exactly once",
        ));
    }
    Ok(())
}

fn reorder_offset(connection: &rusqlite::Connection, count: usize) -> AppResult<i64> {
    let maximum: i64 = connection.query_row(
        "SELECT COALESCE(max(\"order\"),-1) FROM navigation_categories",
        [],
        |row| row.get(0),
    )?;
    let count = i64::try_from(count)
        .map_err(|_| AppError::internal_error("Navigation category count overflow"))?;
    maximum
        .checked_add(count)
        .and_then(|value| value.checked_add(1))
        .ok_or_else(|| AppError::internal_error("Navigation category order overflow"))
}

fn get(
    connection: &rusqlite::Connection,
    id: NavigationCategoryId,
) -> AppResult<Option<NavigationCategory>> {
    connection
        .query_row(
            "SELECT id,name,\"order\",created_at,updated_at FROM navigation_categories WHERE id=?1",
            [id],
            category_from_row,
        )
        .optional()
        .map_err(Into::into)
}

fn category_from_row(row: &Row<'_>) -> rusqlite::Result<NavigationCategory> {
    Ok(NavigationCategory {
        id: row.get(0)?,
        name: row.get(1)?,
        order: row.get(2)?,
        created_at: row.get(3)?,
        updated_at: row.get(4)?,
    })
}

fn list_cards(
    connection: &rusqlite::Connection,
    category_id: NavigationCategoryId,
) -> AppResult<Vec<NavigationPlacementCard>> {
    let mut statement = connection.prepare(
        "SELECT p.id,b.id,b.title,b.url,p.created_at FROM navigation_placements p JOIN bookmarks b ON b.id=p.bookmark_id WHERE p.category_id=?1 ORDER BY p.id",
    )?;
    let cards = statement
        .query_map([category_id], |row| {
            Ok(NavigationPlacementCard {
                placement_id: row.get(0)?,
                bookmark_id: row.get(1)?,
                title: row.get(2)?,
                url: row.get(3)?,
                created_at: row.get(4)?,
            })
        })?
        .collect::<Result<Vec<_>, _>>()
        .map_err(AppError::from)?;
    Ok(cards)
}

fn ensure_category_exists(
    connection: &rusqlite::Connection,
    id: NavigationCategoryId,
) -> AppResult<()> {
    if get(connection, id)?.is_none() {
        return Err(not_found(id));
    }
    Ok(())
}

fn placement_write_error(error: rusqlite::Error) -> AppError {
    if matches!(error, rusqlite::Error::SqliteFailure(ref inner, _) if inner.extended_code == rusqlite::ffi::SQLITE_CONSTRAINT_UNIQUE)
    {
        AppError::validation_error("Bookmark is already in this navigation category")
    } else if matches!(error, rusqlite::Error::SqliteFailure(ref inner, _) if inner.extended_code == rusqlite::ffi::SQLITE_CONSTRAINT_FOREIGNKEY)
    {
        AppError::validation_error("Bookmark does not exist")
    } else {
        error.into()
    }
}

fn category_write_error(error: rusqlite::Error) -> AppError {
    if matches!(error, rusqlite::Error::SqliteFailure(ref inner, _) if inner.extended_code == rusqlite::ffi::SQLITE_CONSTRAINT_UNIQUE)
    {
        AppError::navigation_category_conflict()
    } else {
        error.into()
    }
}

fn not_found(id: NavigationCategoryId) -> AppError {
    AppError::navigation_category_not_found(id)
}

pub type SharedNavigationStore = Arc<NavigationStore>;
