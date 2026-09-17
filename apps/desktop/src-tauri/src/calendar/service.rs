use std::{collections::BTreeMap, sync::Arc};

use crate::error::AppResult;

use super::{CalendarDay, CalendarRangeRequest, CalendarSource};

pub type SharedCalendarService = Arc<CalendarService>;

pub struct CalendarService {
    sources: Vec<Arc<dyn CalendarSource>>,
}

impl CalendarService {
    pub fn new(sources: Vec<Arc<dyn CalendarSource>>) -> Self {
        Self { sources }
    }

    pub async fn query(&self, request: CalendarRangeRequest) -> AppResult<Vec<CalendarDay>> {
        let range = request.validate()?;
        let mut by_date = BTreeMap::<String, CalendarDay>::new();
        for source in &self.sources {
            let days = match source.load(range).await {
                Ok(days) => days,
                Err(error) => {
                    log::warn!(
                        "calendar_source_failed source={} error={error}",
                        source.id()
                    );
                    continue;
                }
            };
            for day in days {
                let entry = by_date
                    .entry(day.date.clone())
                    .or_insert_with(|| CalendarDay {
                        date: day.date.clone(),
                        holidays: Vec::new(),
                        events: Vec::new(),
                        todos: Vec::new(),
                    });
                entry.holidays.extend(day.holidays);
                entry.events.extend(day.events);
                entry.todos.extend(day.todos);
            }
        }
        Ok(by_date
            .into_values()
            .filter(|day| {
                !day.holidays.is_empty() || !day.events.is_empty() || !day.todos.is_empty()
            })
            .collect())
    }
}

#[cfg(test)]
mod tests {
    use std::sync::{
        atomic::{AtomicUsize, Ordering},
        Arc,
    };

    use super::CalendarService;
    use crate::calendar::{
        CalendarDay, CalendarRange, CalendarRangeRequest, CalendarSource, SourceFuture,
    };

    struct FakeSource {
        id: &'static str,
        result: Result<Vec<CalendarDay>, String>,
        calls: Arc<AtomicUsize>,
    }

    impl CalendarSource for FakeSource {
        fn id(&self) -> &str {
            self.id
        }
        fn load<'a>(&'a self, _range: CalendarRange) -> SourceFuture<'a> {
            self.calls.fetch_add(1, Ordering::SeqCst);
            Box::pin(async move { self.result.clone() })
        }
    }

    fn day(date: &str) -> CalendarDay {
        CalendarDay {
            date: date.into(),
            holidays: Vec::new(),
            events: Vec::new(),
            todos: Vec::new(),
        }
    }

    #[tokio::test]
    async fn isolates_failed_sources_and_omits_empty_days() {
        let calls = Arc::new(AtomicUsize::new(0));
        let service = CalendarService::new(vec![
            Arc::new(FakeSource {
                id: "failed",
                result: Err("offline".into()),
                calls: calls.clone(),
            }),
            Arc::new(FakeSource {
                id: "working",
                result: Ok(vec![day("2026-10-01")]),
                calls: calls.clone(),
            }),
        ]);
        let request = CalendarRangeRequest {
            start_date: "2026-10-01".into(),
            end_date: "2026-10-02".into(),
        };

        let result = service.query(request).await.unwrap();

        assert!(result.is_empty());
        assert_eq!(calls.load(Ordering::SeqCst), 2);
    }

    #[tokio::test]
    async fn rejects_invalid_ranges_before_loading_sources() {
        let calls = Arc::new(AtomicUsize::new(0));
        let service = CalendarService::new(vec![Arc::new(FakeSource {
            id: "working",
            result: Ok(Vec::new()),
            calls: calls.clone(),
        })]);

        let result = service
            .query(CalendarRangeRequest {
                start_date: "not-a-date".into(),
                end_date: "2026-10-02".into(),
            })
            .await;

        assert!(result.is_err());
        assert_eq!(calls.load(Ordering::SeqCst), 0);
    }
}
