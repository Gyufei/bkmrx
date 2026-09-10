use std::{
    collections::HashSet,
    fs,
    path::{Path, PathBuf},
};

use chrono::{DateTime, SecondsFormat, Utc};
use rusqlite::{params, Connection, Transaction};
use serde::{Deserialize, Serialize};

use crate::{
    database::Database,
    error::{AppError, AppResult},
    identity::{BookmarkId, BookmarkTagId, NavigationCategoryId, NavigationPlacementId},
};

use super::{BookmarkInitializationResult, BookmarkInitializationStatus};

const FORMAT_VERSION: u32 = 2;

#[derive(Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct BookmarkDatasetV2 {
    format_version: u32,
    exported_at: String,
    app_version: String,
    bookmarks: Vec<DatasetBookmark>,
    tags: Vec<DatasetTag>,
    bookmark_tag_relations: Vec<DatasetBookmarkTagRelation>,
    navigation_categories: Vec<DatasetNavigationCategory>,
    navigation_placements: Vec<DatasetNavigationPlacement>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct DatasetBookmark {
    id: BookmarkId,
    url: String,
    title: String,
    description: String,
    access_count: i64,
    created_at: String,
    updated_at: String,
    accessed_at: Option<String>,
    starred_at: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct DatasetTag {
    id: BookmarkTagId,
    name: String,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct DatasetBookmarkTagRelation {
    bookmark_id: BookmarkId,
    tag_id: BookmarkTagId,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct DatasetNavigationCategory {
    id: NavigationCategoryId,
    name: String,
    order: i64,
    created_at: i64,
    updated_at: i64,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct DatasetNavigationPlacement {
    id: NavigationPlacementId,
    category_id: NavigationCategoryId,
    bookmark_id: BookmarkId,
    created_at: i64,
}

pub(super) fn export(database: &Database, destination: &Path) -> AppResult<PathBuf> {
    let dataset = database.snapshot(snapshot)?;
    let bytes = serde_json::to_vec_pretty(&dataset).map_err(|error| {
        AppError::internal_error(format!("failed to serialize Bookmark Dataset: {error}"))
    })?;
    let timestamp = Utc::now().format("%Y%m%d-%H%M%S");
    let destination = if destination.extension().is_some_and(|value| value == "json") {
        destination.to_owned()
    } else {
        destination.join(format!("bookmarks-{timestamp}.json"))
    };
    crate::fsutil::write_atomically(&destination, &bytes)?;
    Ok(destination)
}

pub(super) fn initialization_status(
    database: &Database,
) -> AppResult<BookmarkInitializationStatus> {
    database.read(|connection| {
        Ok(BookmarkInitializationStatus {
            can_initialize: domain_is_empty(connection)?,
        })
    })
}

pub(super) fn initialize(
    database: &Database,
    source: &Path,
) -> AppResult<BookmarkInitializationResult> {
    let bytes = fs::read(source).map_err(|error| AppError::internal_error(error.to_string()))?;
    let dataset = parse_and_validate(&bytes)?;
    database.write(|transaction| {
        if !domain_is_empty(transaction)? {
            return Err(AppError::import_validation_failed(
                "Bookmark Initialization requires empty Bookmarks and Navigation Categories",
            ));
        }
        insert_dataset(transaction, &dataset)?;
        Ok(BookmarkInitializationResult {
            bookmark_count: dataset.bookmarks.len(),
            navigation_category_count: dataset.navigation_categories.len(),
        })
    })
}

fn snapshot(connection: &Transaction<'_>) -> AppResult<BookmarkDatasetV2> {
    Ok(BookmarkDatasetV2 {
        format_version: FORMAT_VERSION,
        exported_at: Utc::now().to_rfc3339_opts(SecondsFormat::Secs, true),
        app_version: env!("CARGO_PKG_VERSION").to_owned(),
        bookmarks: query(connection, "SELECT id,url,title,description,access_count,created_at,updated_at,accessed_at,starred_at FROM bookmarks ORDER BY id", |row| Ok(DatasetBookmark {
            id: row.get(0)?, url: row.get(1)?, title: row.get(2)?, description: row.get(3)?, access_count: row.get(4)?,
            created_at: timestamp(row.get(5)?, SecondsFormat::Millis)?, updated_at: timestamp(row.get(6)?, SecondsFormat::Millis)?,
            accessed_at: optional_timestamp(row.get(7)?, SecondsFormat::Millis)?, starred_at: optional_timestamp(row.get(8)?, SecondsFormat::Millis)?,
        }))?,
        tags: query(connection, "SELECT id,name FROM tags ORDER BY id", |row| Ok(DatasetTag { id: row.get(0)?, name: row.get(1)? }))?,
        bookmark_tag_relations: query(connection, "SELECT bookmark_id,tag_id FROM bookmark_tags ORDER BY bookmark_id,tag_id", |row| Ok(DatasetBookmarkTagRelation { bookmark_id: row.get(0)?, tag_id: row.get(1)? }))?,
        navigation_categories: query(connection, "SELECT id,name,\"order\",created_at,updated_at FROM navigation_categories ORDER BY \"order\",id", |row| Ok(DatasetNavigationCategory { id: row.get(0)?, name: row.get(1)?, order: row.get(2)?, created_at: row.get(3)?, updated_at: row.get(4)? }))?,
        navigation_placements: query(connection, "SELECT id,category_id,bookmark_id,created_at FROM navigation_placements ORDER BY id", |row| Ok(DatasetNavigationPlacement { id: row.get(0)?, category_id: row.get(1)?, bookmark_id: row.get(2)?, created_at: row.get(3)? }))?,
    })
}

fn query<T>(
    connection: &Connection,
    sql: &str,
    map: impl FnMut(&rusqlite::Row<'_>) -> rusqlite::Result<T>,
) -> AppResult<Vec<T>> {
    let mut statement = connection.prepare(sql)?;
    let values = statement
        .query_map([], map)?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(values)
}

fn parse_and_validate(bytes: &[u8]) -> AppResult<BookmarkDatasetV2> {
    let value: serde_json::Value =
        serde_json::from_slice(bytes).map_err(|error| invalid(format!("Invalid JSON: {error}")))?;
    let version = value
        .get("format_version")
        .and_then(serde_json::Value::as_u64)
        .unwrap_or_default();
    if version != u64::from(FORMAT_VERSION) {
        return Err(AppError::unsupported_import_format(version));
    }
    let dataset: BookmarkDatasetV2 = serde_json::from_value(value)
        .map_err(|error| invalid(format!("Invalid V2 Bookmark Dataset: {error}")))?;
    parse_time("exported_at", &dataset.exported_at)?;
    validate(&dataset)?;
    Ok(dataset)
}

fn validate(dataset: &BookmarkDatasetV2) -> AppResult<()> {
    unique(dataset.bookmarks.iter().map(|item| item.id), "Bookmark ID")?;
    unique(dataset.tags.iter().map(|item| item.id), "Tag ID")?;
    unique(
        dataset.navigation_categories.iter().map(|item| item.id),
        "Navigation Category ID",
    )?;
    unique(
        dataset.navigation_placements.iter().map(|item| item.id),
        "Navigation Placement ID",
    )?;
    unique(
        dataset
            .bookmarks
            .iter()
            .map(|item| item.url.trim().to_owned()),
        "Bookmark URL",
    )?;
    unique(
        dataset.tags.iter().map(|item| item.name.clone()),
        "Tag name",
    )?;
    unique(
        dataset
            .navigation_categories
            .iter()
            .map(|item| item.name.trim().to_lowercase()),
        "Navigation Category name",
    )?;
    unique(
        dataset.navigation_categories.iter().map(|item| item.order),
        "Navigation Category order",
    )?;
    unique(
        dataset
            .bookmark_tag_relations
            .iter()
            .map(|item| (item.bookmark_id, item.tag_id)),
        "Bookmark–Tag Relation",
    )?;
    unique(
        dataset
            .navigation_placements
            .iter()
            .map(|item| (item.category_id, item.bookmark_id)),
        "Navigation Placement relation",
    )?;
    let bookmark_ids = dataset
        .bookmarks
        .iter()
        .map(|item| item.id)
        .collect::<HashSet<_>>();
    let tag_ids = dataset
        .tags
        .iter()
        .map(|item| item.id)
        .collect::<HashSet<_>>();
    let category_ids = dataset
        .navigation_categories
        .iter()
        .map(|item| item.id)
        .collect::<HashSet<_>>();
    for (index, bookmark) in dataset.bookmarks.iter().enumerate() {
        if bookmark.url.trim().is_empty() || bookmark.access_count < 0 {
            return Err(invalid(format!("bookmarks[{index}] has invalid fields")));
        }
        parse_time("created_at", &bookmark.created_at)?;
        parse_time("updated_at", &bookmark.updated_at)?;
        optional_parse_time("accessed_at", bookmark.accessed_at.as_deref())?;
        optional_parse_time("starred_at", bookmark.starred_at.as_deref())?;
    }
    if dataset
        .tags
        .iter()
        .any(|item| item.name.trim().is_empty() || item.name.contains(','))
    {
        return Err(invalid("Tag name is invalid"));
    }
    if dataset
        .navigation_categories
        .iter()
        .any(|item| item.name.trim().is_empty() || item.order < 0)
    {
        return Err(invalid("Navigation Category is invalid"));
    }
    for relation in &dataset.bookmark_tag_relations {
        if !bookmark_ids.contains(&relation.bookmark_id) || !tag_ids.contains(&relation.tag_id) {
            return Err(invalid("Bookmark–Tag Relation has a dangling reference"));
        }
    }
    for placement in &dataset.navigation_placements {
        if !bookmark_ids.contains(&placement.bookmark_id)
            || !category_ids.contains(&placement.category_id)
        {
            return Err(invalid("Navigation Placement has a dangling reference"));
        }
    }
    Ok(())
}

fn insert_dataset(transaction: &Transaction<'_>, dataset: &BookmarkDatasetV2) -> AppResult<()> {
    for item in &dataset.bookmarks {
        transaction.execute("INSERT INTO bookmarks(id,url,title,description,access_count,created_at,updated_at,accessed_at,starred_at) VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9)", params![item.id,item.url,item.title,item.description,item.access_count,parse_time("created_at", &item.created_at)?,parse_time("updated_at", &item.updated_at)?,optional_parse_time("accessed_at", item.accessed_at.as_deref())?,optional_parse_time("starred_at", item.starred_at.as_deref())?])?;
    }
    for item in &dataset.tags {
        transaction.execute(
            "INSERT INTO tags(id,name) VALUES(?1,?2)",
            params![item.id, item.name],
        )?;
    }
    for item in &dataset.navigation_categories {
        transaction.execute("INSERT INTO navigation_categories(id,name,\"order\",created_at,updated_at) VALUES(?1,?2,?3,?4,?5)", params![item.id,item.name,item.order,item.created_at,item.updated_at])?;
    }
    for item in &dataset.bookmark_tag_relations {
        transaction.execute(
            "INSERT INTO bookmark_tags(bookmark_id,tag_id) VALUES(?1,?2)",
            params![item.bookmark_id, item.tag_id],
        )?;
    }
    for item in &dataset.navigation_placements {
        transaction.execute("INSERT INTO navigation_placements(id,category_id,bookmark_id,created_at) VALUES(?1,?2,?3,?4)", params![item.id,item.category_id,item.bookmark_id,item.created_at])?;
    }
    rebuild_fts(transaction, dataset)
}

fn rebuild_fts(transaction: &Transaction<'_>, dataset: &BookmarkDatasetV2) -> AppResult<()> {
    transaction.execute("DELETE FROM bookmarks_fts", [])?;
    for bookmark in &dataset.bookmarks {
        let tags = {
            let mut statement = transaction.prepare(
                "SELECT t.name FROM bookmark_tags bt JOIN tags t ON t.id=bt.tag_id WHERE bt.bookmark_id=?1 ORDER BY t.name",
            )?;
            let values = statement
                .query_map([bookmark.id], |row| row.get::<_, String>(0))?
                .collect::<Result<Vec<_>, _>>()?;
            values
        };
        transaction.execute("INSERT INTO bookmarks_fts(bookmark_uuid,url,title,description,tags) VALUES(?1,?2,?3,?4,?5)", params![bookmark.id,bookmark.url,bookmark.title,bookmark.description,tags.join(" ")])?;
    }
    Ok(())
}

fn domain_is_empty(connection: &Connection) -> AppResult<bool> {
    connection.query_row("SELECT NOT EXISTS(SELECT 1 FROM bookmarks) AND NOT EXISTS(SELECT 1 FROM navigation_categories)", [], |row| row.get(0)).map_err(Into::into)
}

fn unique<T: Eq + std::hash::Hash>(
    values: impl IntoIterator<Item = T>,
    label: &str,
) -> AppResult<()> {
    let mut seen = HashSet::new();
    for value in values {
        if !seen.insert(value) {
            return Err(invalid(format!("{label} is duplicated")));
        }
    }
    Ok(())
}

fn parse_time(field: &str, value: &str) -> AppResult<i64> {
    DateTime::parse_from_rfc3339(value)
        .map(|value| value.timestamp_millis())
        .map_err(|error| invalid(format!("{field} must be RFC 3339: {error}")))
}
fn optional_parse_time(field: &str, value: Option<&str>) -> AppResult<Option<i64>> {
    value.map(|value| parse_time(field, value)).transpose()
}
fn timestamp(value: i64, format: SecondsFormat) -> rusqlite::Result<String> {
    DateTime::<Utc>::from_timestamp_millis(value)
        .map(|value| value.to_rfc3339_opts(format, true))
        .ok_or_else(|| rusqlite::Error::IntegralValueOutOfRange(0, value))
}
fn optional_timestamp(
    value: Option<i64>,
    format: SecondsFormat,
) -> rusqlite::Result<Option<String>> {
    value.map(|value| timestamp(value, format)).transpose()
}
fn invalid(message: impl Into<String>) -> AppError {
    AppError::import_validation_failed(message)
}
