use std::{collections::BTreeMap, sync::Arc};

use crate::error::{AppError, AppResult};

use super::{
    CalendarContribution, CalendarDay, CalendarRangeRequest, CalendarSource,
    CalendarSourceRequirement,
};

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
            let contributions = match source.load(range).await {
                Ok(contributions) => contributions,
                Err(error) => match source.requirement() {
                    CalendarSourceRequirement::Optional => {
                        log::warn!(
                            "calendar_source_failed source={} requirement=optional error={error}",
                            source.id()
                        );
                        continue;
                    }
                    CalendarSourceRequirement::Required => {
                        log::error!(
                            "calendar_source_failed source={} requirement=required error={error}",
                            source.id()
                        );
                        return Err(AppError::internal_error(
                            "Required calendar data could not be loaded",
                        ));
                    }
                },
            };
            for contribution in contributions {
                let date = contribution.date().to_owned();
                let entry = by_date.entry(date.clone()).or_insert_with(|| CalendarDay {
                    date,
                    holidays: Vec::new(),
                    events: Vec::new(),
                    todos: Vec::new(),
                });
                match contribution {
                    CalendarContribution::Holiday { annotation, .. } => {
                        if !entry.holidays.contains(&annotation) {
                            entry.holidays.push(annotation);
                        }
                    }
                    CalendarContribution::Event { event, .. } => {
                        if !entry.events.contains(&event) {
                            entry.events.push(event);
                        }
                    }
                    CalendarContribution::Todo { todo, .. } => {
                        if !entry.todos.contains(&todo) {
                            entry.todos.push(todo);
                        }
                    }
                }
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
        CalendarContribution, CalendarHolidayDayType, CalendarRange, CalendarRangeRequest,
        CalendarSource, CalendarSourceRequirement, HolidayAnnotation, SourceFuture,
    };

    struct FakeSource {
        id: &'static str,
        requirement: CalendarSourceRequirement,
        result: Result<Vec<CalendarContribution>, String>,
        calls: Arc<AtomicUsize>,
    }

    impl CalendarSource for FakeSource {
        fn id(&self) -> &str {
            self.id
        }

        fn requirement(&self) -> CalendarSourceRequirement {
            self.requirement
        }

        fn load<'a>(&'a self, _range: CalendarRange) -> SourceFuture<'a> {
            self.calls.fetch_add(1, Ordering::SeqCst);
            Box::pin(async move { self.result.clone() })
        }
    }

    fn holiday(date: &str, name: &str) -> CalendarContribution {
        CalendarContribution::Holiday {
            date: date.into(),
            annotation: HolidayAnnotation {
                name: name.into(),
                display_name: name.into(),
                day_type: CalendarHolidayDayType::DayOff,
                source: "test".into(),
            },
        }
    }

    #[tokio::test]
    async fn degrades_optional_failures_and_aggregates_unique_contributions_by_date() {
        let calls = Arc::new(AtomicUsize::new(0));
        let annotation = holiday("2026-10-01", "国庆节");
        let service = CalendarService::new(vec![
            Arc::new(FakeSource {
                id: "optional-failed",
                requirement: CalendarSourceRequirement::Optional,
                result: Err("offline".into()),
                calls: calls.clone(),
            }),
            Arc::new(FakeSource {
                id: "working",
                requirement: CalendarSourceRequirement::Required,
                result: Ok(vec![
                    holiday("2026-10-02", "次日"),
                    annotation.clone(),
                    annotation,
                ]),
                calls: calls.clone(),
            }),
        ]);
        let request = CalendarRangeRequest {
            start_date: "2026-10-01".into(),
            end_date: "2026-10-02".into(),
        };

        let result = service.query(request).await.unwrap();

        assert_eq!(result.len(), 2);
        assert_eq!(result[0].date, "2026-10-01");
        assert_eq!(result[0].holidays.len(), 1);
        assert_eq!(result[1].date, "2026-10-02");
        assert_eq!(calls.load(Ordering::SeqCst), 2);
    }

    #[tokio::test]
    async fn propagates_required_source_failures() {
        let calls = Arc::new(AtomicUsize::new(0));
        let service = CalendarService::new(vec![Arc::new(FakeSource {
            id: "required-failed",
            requirement: CalendarSourceRequirement::Required,
            result: Err("database unavailable".into()),
            calls: calls.clone(),
        })]);

        let error = service
            .query(CalendarRangeRequest {
                start_date: "2026-10-01".into(),
                end_date: "2026-10-02".into(),
            })
            .await
            .unwrap_err();

        assert_eq!(error.code(), "internal_error");
        assert_eq!(error.message, "Required calendar data could not be loaded");
        assert_eq!(calls.load(Ordering::SeqCst), 1);
    }

    #[tokio::test]
    async fn rejects_invalid_ranges_before_loading_sources() {
        let calls = Arc::new(AtomicUsize::new(0));
        let service = CalendarService::new(vec![Arc::new(FakeSource {
            id: "working",
            requirement: CalendarSourceRequirement::Required,
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
