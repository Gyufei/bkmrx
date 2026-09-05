use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine};
use rusqlite::{params, params_from_iter, types::Value, Connection};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::BTreeSet;

use crate::error::{AppError, AppResult};

use super::{
    sql::{escape_like, placeholders},
    BookmarkPageRequest,
};

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct SearchPage {
    pub bookmark_ids: Vec<i64>,
    pub next_cursor: Option<String>,
}

#[derive(Debug, Clone, Copy, Default)]
pub(crate) struct SqliteFtsSearch;

impl SqliteFtsSearch {
    pub(crate) fn search_with_connection(
        &self,
        connection: &Connection,
        request: &BookmarkPageRequest,
    ) -> AppResult<SearchPage> {
        match request {
            BookmarkPageRequest::Browse {
                starred,
                cursor,
                page_size,
            } => self.search_browse(connection, *starred, cursor.as_deref(), *page_size),
            BookmarkPageRequest::Search {
                query,
                tags,
                cursor,
                page_size,
            } => self.search_filtered(connection, query, tags, cursor.as_deref(), *page_size),
            BookmarkPageRequest::Random { limit } => self.search_random(connection, *limit),
        }
    }

    fn search_browse(
        &self,
        connection: &Connection,
        starred: bool,
        encoded_cursor: Option<&str>,
        page_size: u32,
    ) -> AppResult<SearchPage> {
        validate_page_size(page_size)?;
        let query_hash = query_hash(&("browse", starred, page_size))?;
        let cursor = validated_cursor(encoded_cursor, &query_hash)?;
        if starred {
            self.search_starred(connection, page_size, query_hash, cursor)
        } else {
            self.search_recent(connection, &[], page_size, query_hash, cursor)
        }
    }

    fn search_filtered(
        &self,
        connection: &Connection,
        raw_query: &str,
        raw_tags: &[String],
        encoded_cursor: Option<&str>,
        page_size: u32,
    ) -> AppResult<SearchPage> {
        validate_page_size(page_size)?;
        let query = raw_query.trim();
        let tags = normalize_tags(raw_tags);
        if query.is_empty() && tags.is_empty() {
            return Err(AppError::validation_error(
                "search requires a query or at least one tag",
            ));
        }
        let query_hash = query_hash(&("search", query, &tags, page_size))?;
        let cursor = validated_cursor(encoded_cursor, &query_hash)?;
        match query.chars().count() {
            0 => self.search_recent(connection, &tags, page_size, query_hash, cursor),
            1 | 2 => self.search_like(connection, query, &tags, page_size, query_hash, cursor),
            _ => self.search_fts(connection, query, &tags, page_size, query_hash, cursor),
        }
    }

    fn search_random(&self, connection: &Connection, limit: u32) -> AppResult<SearchPage> {
        validate_page_size(limit)?;
        let mut statement =
            connection.prepare("SELECT id FROM bookmarks ORDER BY RANDOM() LIMIT ?")?;
        let rows = statement.query_map(params![limit], |row| row.get::<_, i64>(0))?;
        let bookmark_ids = rows.collect::<Result<Vec<_>, _>>()?;
        Ok(SearchPage {
            bookmark_ids,
            next_cursor: None,
        })
    }

    fn search_starred(
        &self,
        connection: &Connection,
        page_size: u32,
        query_hash: String,
        cursor: Option<CursorMode>,
    ) -> AppResult<SearchPage> {
        let mut sql =
            String::from("SELECT id, starred_at FROM bookmarks WHERE starred_at IS NOT NULL");
        let mut values = Vec::new();
        if let Some(cursor) = cursor {
            let CursorMode::Starred { starred_at, id } = cursor else {
                return Err(AppError::invalid_cursor());
            };
            sql.push_str(" AND (starred_at < ? OR (starred_at = ? AND id < ?))");
            values.push(Value::Integer(starred_at));
            values.push(Value::Integer(starred_at));
            values.push(Value::Integer(id));
        }
        sql.push_str(" ORDER BY starred_at DESC, id DESC LIMIT ?");
        values.push(Value::Integer(i64::from(page_size) + 1));

        let mut statement = connection.prepare(&sql)?;
        let rows = statement.query_map(params_from_iter(values.iter()), |row| {
            Ok((row.get::<_, i64>(0)?, row.get::<_, i64>(1)?))
        })?;
        let mut hits = rows.collect::<Result<Vec<_>, _>>()?;
        let has_more = hits.len() > page_size as usize;
        hits.truncate(page_size as usize);
        let next_cursor = if has_more {
            hits.last()
                .map(|(id, starred_at)| {
                    encode_cursor(&CursorV1 {
                        version: 1,
                        query_hash,
                        mode: CursorMode::Starred {
                            starred_at: *starred_at,
                            id: *id,
                        },
                    })
                })
                .transpose()?
        } else {
            None
        };
        Ok(SearchPage {
            bookmark_ids: hits.into_iter().map(|(id, _)| id).collect(),
            next_cursor,
        })
    }

    fn search_recent(
        &self,
        connection: &Connection,
        tags: &[String],
        page_size: u32,
        query_hash: String,
        cursor: Option<CursorMode>,
    ) -> AppResult<SearchPage> {
        let mut sql = String::from(
            "SELECT b.id, b.updated_at
             FROM bookmarks b
             WHERE 1 = 1",
        );
        let mut values = Vec::new();
        add_tag_filter(&mut sql, &mut values, tags);
        if let Some(cursor) = cursor {
            let CursorMode::Recent { updated_at, id } = cursor else {
                return Err(AppError::invalid_cursor());
            };
            sql.push_str(" AND (b.updated_at < ? OR (b.updated_at = ? AND b.id < ?))");
            values.push(Value::Integer(updated_at));
            values.push(Value::Integer(updated_at));
            values.push(Value::Integer(id));
        }
        sql.push_str(" ORDER BY b.updated_at DESC, b.id DESC LIMIT ?");
        values.push(Value::Integer(i64::from(page_size) + 1));

        let mut statement = connection.prepare(&sql)?;
        let rows = statement.query_map(params_from_iter(values.iter()), |row| {
            Ok((row.get::<_, i64>(0)?, row.get::<_, i64>(1)?))
        })?;
        let mut hits = rows.collect::<Result<Vec<_>, _>>()?;
        let has_more = hits.len() > page_size as usize;
        hits.truncate(page_size as usize);
        let next_cursor = if has_more {
            hits.last()
                .map(|(id, updated_at)| {
                    encode_cursor(&CursorV1 {
                        version: 1,
                        query_hash,
                        mode: CursorMode::Recent {
                            updated_at: *updated_at,
                            id: *id,
                        },
                    })
                })
                .transpose()?
        } else {
            None
        };

        Ok(SearchPage {
            bookmark_ids: hits.into_iter().map(|(id, _)| id).collect(),
            next_cursor,
        })
    }

    fn search_like(
        &self,
        connection: &Connection,
        query: &str,
        tags: &[String],
        page_size: u32,
        query_hash: String,
        cursor: Option<CursorMode>,
    ) -> AppResult<SearchPage> {
        let offset = search_offset(cursor)?;
        let mut sql = String::from(
            "SELECT b.id
             FROM bookmarks b
             WHERE (
                 b.url LIKE ? ESCAPE char(92)
                 OR b.title LIKE ? ESCAPE char(92)
                 OR b.description LIKE ? ESCAPE char(92)
                 OR EXISTS (
                     SELECT 1
                     FROM bookmark_tags search_bt
                     JOIN tags search_t ON search_t.id = search_bt.tag_id
                     WHERE search_bt.bookmark_id = b.id
                       AND search_t.name LIKE ? ESCAPE char(92)
                 )
             )",
        );
        let pattern = format!("%{}%", escape_like(query));
        let mut values = vec![
            Value::Text(pattern.clone()),
            Value::Text(pattern.clone()),
            Value::Text(pattern.clone()),
            Value::Text(pattern),
        ];
        add_tag_filter(&mut sql, &mut values, tags);
        sql.push_str(" ORDER BY b.updated_at DESC, b.id DESC LIMIT ? OFFSET ?");
        values.push(Value::Integer(i64::from(page_size) + 1));
        values.push(Value::Integer(offset as i64));
        self.text_page(connection, sql, values, page_size, offset, query_hash)
    }

    fn search_fts(
        &self,
        connection: &Connection,
        query: &str,
        tags: &[String],
        page_size: u32,
        query_hash: String,
        cursor: Option<CursorMode>,
    ) -> AppResult<SearchPage> {
        let offset = search_offset(cursor)?;
        let mut sql = String::from(
            "SELECT b.id
             FROM bookmarks_fts
             JOIN bookmarks b ON b.id = bookmarks_fts.rowid
             WHERE bookmarks_fts MATCH ?",
        );
        let mut values = vec![Value::Text(fts_literal_phrase(query))];
        add_tag_filter(&mut sql, &mut values, tags);
        sql.push_str(
            " ORDER BY bm25(bookmarks_fts), b.updated_at DESC, b.id DESC
              LIMIT ? OFFSET ?",
        );
        values.push(Value::Integer(i64::from(page_size) + 1));
        values.push(Value::Integer(offset as i64));
        self.text_page(connection, sql, values, page_size, offset, query_hash)
    }

    fn text_page(
        &self,
        connection: &Connection,
        sql: String,
        values: Vec<Value>,
        page_size: u32,
        offset: u64,
        query_hash: String,
    ) -> AppResult<SearchPage> {
        let mut statement = connection.prepare(&sql)?;
        let rows =
            statement.query_map(params_from_iter(values.iter()), |row| row.get::<_, i64>(0))?;
        let mut ids = rows.collect::<Result<Vec<_>, _>>()?;
        let has_more = ids.len() > page_size as usize;
        ids.truncate(page_size as usize);
        let next_cursor = if has_more {
            Some(encode_cursor(&CursorV1 {
                version: 1,
                query_hash,
                mode: CursorMode::SearchOffset {
                    offset: offset + ids.len() as u64,
                },
            })?)
        } else {
            None
        };
        Ok(SearchPage {
            bookmark_ids: ids,
            next_cursor,
        })
    }
}

#[derive(Debug, Serialize, Deserialize)]
struct CursorV1 {
    version: u8,
    query_hash: String,
    mode: CursorMode,
}

#[derive(Debug, Serialize, Deserialize)]
enum CursorMode {
    Starred { starred_at: i64, id: i64 },
    Recent { updated_at: i64, id: i64 },
    SearchOffset { offset: u64 },
}

fn encode_cursor(cursor: &CursorV1) -> AppResult<String> {
    serde_json::to_vec(cursor)
        .map(|json| URL_SAFE_NO_PAD.encode(json))
        .map_err(|error| AppError::internal_error(format!("failed to encode cursor: {error}")))
}

fn decode_cursor(cursor: &str) -> AppResult<CursorV1> {
    let json = URL_SAFE_NO_PAD
        .decode(cursor)
        .map_err(|_| AppError::invalid_cursor())?;
    serde_json::from_slice(&json).map_err(|_| AppError::invalid_cursor())
}

fn search_offset(cursor: Option<CursorMode>) -> AppResult<u64> {
    match cursor {
        None => Ok(0),
        Some(CursorMode::SearchOffset { offset }) => Ok(offset),
        Some(CursorMode::Recent { .. }) => Err(AppError::invalid_cursor()),
        Some(CursorMode::Starred { .. }) => Err(AppError::invalid_cursor()),
    }
}

fn query_hash(value: &impl Serialize) -> AppResult<String> {
    let input = serde_json::to_vec(value)
        .map_err(|error| AppError::internal_error(format!("failed to hash query: {error}")))?;
    Ok(URL_SAFE_NO_PAD.encode(Sha256::digest(input)))
}

fn validated_cursor(encoded: Option<&str>, query_hash: &str) -> AppResult<Option<CursorMode>> {
    let cursor = encoded.map(decode_cursor).transpose()?;
    if cursor
        .as_ref()
        .is_some_and(|cursor| cursor.version != 1 || cursor.query_hash != query_hash)
    {
        return Err(AppError::invalid_cursor());
    }
    Ok(cursor.map(|cursor| cursor.mode))
}

fn normalize_tags(tags: &[String]) -> Vec<String> {
    tags.iter()
        .map(|tag| tag.trim().to_owned())
        .filter(|tag| !tag.is_empty())
        .collect::<BTreeSet<_>>()
        .into_iter()
        .collect()
}

fn add_tag_filter(sql: &mut String, values: &mut Vec<Value>, tags: &[String]) {
    if tags.is_empty() {
        return;
    }
    sql.push_str(
        " AND b.id IN (
            SELECT filter_bt.bookmark_id
            FROM bookmark_tags filter_bt
            JOIN tags filter_t ON filter_t.id = filter_bt.tag_id
            WHERE filter_t.name IN (",
    );
    sql.push_str(&placeholders(tags.len()));
    sql.push_str(
        ")
            GROUP BY filter_bt.bookmark_id
            HAVING count(DISTINCT filter_t.id) = ?
        )",
    );
    values.extend(tags.iter().cloned().map(Value::Text));
    values.push(Value::Integer(tags.len() as i64));
}

fn validate_page_size(page_size: u32) -> AppResult<()> {
    if !(1..=100).contains(&page_size) {
        return Err(AppError::validation_error(
            "page_size must be between 1 and 100",
        ));
    }
    Ok(())
}

fn fts_literal_phrase(query: &str) -> String {
    format!("\"{}\"", query.replace('"', "\"\""))
}
