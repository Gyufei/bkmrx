use std::sync::Arc;

use chrono::{SecondsFormat, Utc};
use rusqlite::{params, OptionalExtension};
use serde::{Deserialize, Serialize};

use crate::{
    database::Database,
    date::{format_local_date, parse_local_date},
    error::{AppError, AppResult},
    identity::CalendarEventId,
};

use super::{
    CalendarDay, CalendarEventSummary, CalendarEventType, CalendarRange, CalendarSource,
    SourceFuture,
};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct CalendarEvent {
    pub id: CalendarEventId,
    pub title: String,
    pub date: String,
    pub event_type: CalendarEventType,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Deserialize, PartialEq, Eq)]
pub struct CreateCalendarEvent {
    pub title: String,
    pub date: String,
    #[serde(default)]
    pub event_type: CalendarEventType,
}

#[derive(Debug, Clone, Deserialize, PartialEq, Eq)]
pub struct UpdateCalendarEvent {
    pub title: String,
    pub date: String,
    pub event_type: CalendarEventType,
}

pub struct CalendarEventStore {
    database: Arc<Database>,
}
pub type SharedCalendarEventStore = Arc<CalendarEventStore>;

impl CalendarEventStore {
    pub fn new(database: Arc<Database>) -> Self {
        Self { database }
    }

    pub fn list(&self, start_date: &str, end_date: &str) -> AppResult<Vec<CalendarEvent>> {
        let start = event_date(start_date)?;
        let end = event_date(end_date)?;
        if start > end {
            return Err(AppError::validation_error(
                "Calendar event date range must be ordered",
            ));
        }
        self.database.read(|connection| {
            let mut statement = connection.prepare(
                "SELECT id,title,event_date,event_type,created_at,updated_at FROM calendar_events WHERE event_date BETWEEN ?1 AND ?2 ORDER BY event_date,id"
            )?;
            let rows = statement.query_map(params![format_local_date(start), format_local_date(end)], event_from_row)?;
            rows.collect::<Result<Vec<_>, _>>().map_err(AppError::from)
        })
    }

    pub fn create(&self, input: CreateCalendarEvent) -> AppResult<CalendarEvent> {
        let title = event_title(&input.title)?;
        let date = format_local_date(event_date(&input.date)?);
        let id = CalendarEventId::new();
        let now = Utc::now().timestamp_millis();
        self.database.write(|tx| {
            tx.execute("INSERT INTO calendar_events(id,title,event_date,event_type,created_at,updated_at) VALUES (?1,?2,?3,?4,?5,?5)", params![id,title,date,input.event_type.as_str(),now])?;
            get(tx, id)?.ok_or_else(|| AppError::internal_error("created calendar event could not be reloaded"))
        })
    }

    pub fn update(
        &self,
        id: CalendarEventId,
        input: UpdateCalendarEvent,
    ) -> AppResult<CalendarEvent> {
        let title = event_title(&input.title)?;
        let date = format_local_date(event_date(&input.date)?);
        let now = Utc::now().timestamp_millis();
        self.database.write(|tx| {
            let changed = tx.execute("UPDATE calendar_events SET title=?1,event_date=?2,event_type=?3,updated_at=?4 WHERE id=?5", params![title,date,input.event_type.as_str(),now,id])?;
            if changed == 0 { return Err(event_not_found(id)); }
            get(tx, id)?.ok_or_else(|| event_not_found(id))
        })
    }

    pub fn delete(&self, id: CalendarEventId) -> AppResult<()> {
        let changed = self.database.write(|tx| {
            tx.execute("DELETE FROM calendar_events WHERE id=?1", [id])
                .map_err(AppError::from)
        })?;
        if changed == 0 {
            return Err(event_not_found(id));
        }
        Ok(())
    }
}

impl CalendarSource for CalendarEventStore {
    fn id(&self) -> &str {
        "local-events"
    }
    fn load<'a>(&'a self, range: CalendarRange) -> SourceFuture<'a> {
        Box::pin(async move {
            self.list(
                &format_local_date(range.start()),
                &format_local_date(range.end()),
            )
            .map(|events| {
                events
                    .into_iter()
                    .map(|event| CalendarDay {
                        date: event.date,
                        holidays: Vec::new(),
                        events: vec![CalendarEventSummary {
                            id: event.id.to_string(),
                            title: event.title,
                            event_type: event.event_type,
                            source: "local".into(),
                        }],
                        todos: Vec::new(),
                    })
                    .collect()
            })
            .map_err(|error| error.to_string())
        })
    }
}

fn event_title(value: &str) -> AppResult<String> {
    let value = value.trim();
    if value.is_empty() {
        return Err(AppError::validation_error(
            "Calendar event title cannot be empty",
        ));
    }
    Ok(value.to_owned())
}

fn event_date(value: &str) -> AppResult<chrono::NaiveDate> {
    parse_local_date(value)
        .map_err(|_| AppError::validation_error("Calendar event date must use YYYY-MM-DD"))
}

fn event_not_found(id: CalendarEventId) -> AppError {
    AppError::calendar_event_not_found(id)
}

fn event_from_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<CalendarEvent> {
    let kind: String = row.get(3)?;
    Ok(CalendarEvent {
        id: row.get(0)?,
        title: row.get(1)?,
        date: row.get(2)?,
        event_type: CalendarEventType::from_db(&kind).ok_or_else(|| {
            rusqlite::Error::InvalidColumnType(3, "event_type".into(), rusqlite::types::Type::Text)
        })?,
        created_at: timestamp(row.get(4)?)?,
        updated_at: timestamp(row.get(5)?)?,
    })
}

fn get(connection: &rusqlite::Connection, id: CalendarEventId) -> AppResult<Option<CalendarEvent>> {
    connection.query_row("SELECT id,title,event_date,event_type,created_at,updated_at FROM calendar_events WHERE id=?1", [id], event_from_row).optional().map_err(AppError::from)
}

fn timestamp(value: i64) -> rusqlite::Result<String> {
    chrono::DateTime::<Utc>::from_timestamp_millis(value)
        .map(|value| value.to_rfc3339_opts(SecondsFormat::Secs, true))
        .ok_or(rusqlite::Error::IntegralValueOutOfRange(0, value))
}

#[cfg(test)]
mod tests {
    use super::{CalendarEventStore, CreateCalendarEvent, UpdateCalendarEvent};
    use crate::{calendar::CalendarEventType, database::Database};
    use std::sync::Arc;

    #[test]
    fn creates_queries_updates_and_deletes_events() {
        let store = CalendarEventStore::new(Arc::new(Database::open_in_memory().unwrap()));
        let created = store
            .create(CreateCalendarEvent {
                title: "  产品评审  ".into(),
                date: "2026-09-17".into(),
                event_type: CalendarEventType::Work,
            })
            .unwrap();
        assert_eq!(
            store.list("2026-09-17", "2026-09-17").unwrap(),
            vec![created.clone()]
        );

        let updated = store
            .update(
                created.id,
                UpdateCalendarEvent {
                    title: "设计评审".into(),
                    date: "2026-09-18".into(),
                    event_type: CalendarEventType::Personal,
                },
            )
            .unwrap();
        assert_eq!(updated.title, "设计评审");
        assert!(store.list("2026-09-17", "2026-09-17").unwrap().is_empty());

        store.delete(created.id).unwrap();
        assert!(store.list("2026-09-18", "2026-09-18").unwrap().is_empty());
    }

    #[test]
    fn rejects_empty_titles_and_invalid_dates() {
        let store = CalendarEventStore::new(Arc::new(Database::open_in_memory().unwrap()));
        let invalid_title = store
            .create(CreateCalendarEvent {
                title: " ".into(),
                date: "2026-09-17".into(),
                event_type: CalendarEventType::Other,
            })
            .unwrap_err();
        let invalid_date = store
            .create(CreateCalendarEvent {
                title: "评审".into(),
                date: "2026-02-30".into(),
                event_type: CalendarEventType::Other,
            })
            .unwrap_err();
        assert_eq!(invalid_title.code(), "validation_error");
        assert_eq!(invalid_date.code(), "validation_error");
    }
}
