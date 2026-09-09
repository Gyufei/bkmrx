use std::fmt;
use std::str::FromStr;

use rusqlite::types::{FromSql, FromSqlError, FromSqlResult, ToSqlOutput, ValueRef};
use rusqlite::ToSql;
use serde::{Deserialize, Deserializer, Serialize, Serializer};
use uuid::{Uuid, Version};

#[derive(Debug, Clone, Copy, PartialEq, Eq, thiserror::Error)]
pub enum EntityIdParseError {
    #[error("entity ID must be a canonical lower-case hyphenated UUID v7")]
    Invalid,
}

fn parse_uuid_v7(value: &str) -> Result<Uuid, EntityIdParseError> {
    let uuid = Uuid::parse_str(value).map_err(|_| EntityIdParseError::Invalid)?;
    let is_canonical = uuid.hyphenated().to_string() == value;
    let is_v7 = uuid.get_version() == Some(Version::SortRand);
    if !is_canonical || !is_v7 {
        return Err(EntityIdParseError::Invalid);
    }
    Ok(uuid)
}

macro_rules! entity_id {
    ($name:ident) => {
        #[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash)]
        pub struct $name(Uuid);

        impl $name {
            pub fn new() -> Self {
                Self(Uuid::now_v7())
            }

            pub fn as_uuid(&self) -> &Uuid {
                &self.0
            }
        }

        impl Default for $name {
            fn default() -> Self {
                Self::new()
            }
        }

        impl fmt::Display for $name {
            fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
                self.0.hyphenated().fmt(formatter)
            }
        }

        impl FromStr for $name {
            type Err = EntityIdParseError;

            fn from_str(value: &str) -> Result<Self, Self::Err> {
                parse_uuid_v7(value).map(Self)
            }
        }

        impl Serialize for $name {
            fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
            where
                S: Serializer,
            {
                serializer.serialize_str(&self.to_string())
            }
        }

        impl<'de> Deserialize<'de> for $name {
            fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
            where
                D: Deserializer<'de>,
            {
                let value = String::deserialize(deserializer)?;
                value.parse().map_err(serde::de::Error::custom)
            }
        }

        impl ToSql for $name {
            fn to_sql(&self) -> rusqlite::Result<ToSqlOutput<'_>> {
                Ok(ToSqlOutput::from(self.to_string()))
            }
        }

        impl FromSql for $name {
            fn column_result(value: ValueRef<'_>) -> FromSqlResult<Self> {
                let value = value.as_str()?;
                value
                    .parse()
                    .map_err(|error| FromSqlError::Other(Box::new(error)))
            }
        }
    };
}

entity_id!(BookmarkId);
entity_id!(BookmarkTagId);
entity_id!(TodoId);
entity_id!(TodoTagId);
entity_id!(RssFeedId);
entity_id!(RssEntryId);
entity_id!(NavigationCategoryId);
entity_id!(NavigationPlacementId);

#[cfg(test)]
mod tests {
    use super::{BookmarkId, BookmarkTagId, EntityIdParseError};
    use rusqlite::{params, Connection};
    use uuid::Version;

    #[test]
    fn generates_uuid_v7_in_canonical_form() {
        let id = BookmarkId::new();

        assert_eq!(id.as_uuid().get_version(), Some(Version::SortRand));
        assert_eq!(id.to_string().len(), 36);
        assert_eq!(id.to_string(), id.to_string().to_lowercase());
    }

    #[test]
    fn rejects_non_canonical_and_non_v7_values() {
        let valid = BookmarkId::new().to_string();
        let uppercase = valid.to_uppercase();
        let simple = valid.replace('-', "");
        let v4 = "550e8400-e29b-41d4-a716-446655440000".to_owned();

        for invalid in [uppercase, simple, v4, "not-a-uuid".to_owned()] {
            assert_eq!(
                invalid.parse::<BookmarkId>(),
                Err(EntityIdParseError::Invalid)
            );
        }
    }

    #[test]
    fn serializes_as_a_string_and_rejects_invalid_json() {
        let id = BookmarkId::new();
        let json = serde_json::to_string(&id).unwrap();

        assert_eq!(json, format!("\"{id}\""));
        assert_eq!(serde_json::from_str::<BookmarkId>(&json).unwrap(), id);
        assert!(serde_json::from_str::<BookmarkId>("\"1\"").is_err());
    }

    #[test]
    fn stores_and_reads_uuid_text_with_rusqlite() {
        let connection = Connection::open_in_memory().unwrap();
        connection
            .execute_batch(
                "PRAGMA foreign_keys = ON;
                 CREATE TABLE bookmarks(id TEXT PRIMARY KEY);
                 CREATE TABLE tags(id TEXT PRIMARY KEY);
                 CREATE TABLE bookmark_tags(
                     bookmark_id TEXT NOT NULL REFERENCES bookmarks(id),
                     tag_id TEXT NOT NULL REFERENCES tags(id),
                     PRIMARY KEY (bookmark_id, tag_id)
                 );",
            )
            .unwrap();
        let bookmark_id = BookmarkId::new();
        let tag_id = BookmarkTagId::new();

        connection
            .execute(
                "INSERT INTO bookmarks(id) VALUES (?1)",
                params![bookmark_id],
            )
            .unwrap();
        connection
            .execute("INSERT INTO tags(id) VALUES (?1)", params![tag_id])
            .unwrap();
        connection
            .execute(
                "INSERT INTO bookmark_tags(bookmark_id, tag_id) VALUES (?1, ?2)",
                params![bookmark_id, tag_id],
            )
            .unwrap();
        let stored: BookmarkId = connection
            .query_row("SELECT bookmark_id FROM bookmark_tags", [], |row| {
                row.get(0)
            })
            .unwrap();

        assert_eq!(stored, bookmark_id);
    }
}
