use std::{collections::BTreeMap, sync::Arc};

use crate::error::{AppError, AppResult};

use super::{
    lunar::annotations_for, CalendarContribution, CalendarDay, CalendarRange, CalendarRangeRequest,
    CalendarSource, CalendarSourceRequirement,
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
        let mut by_date = calendar_days(range);
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
                let Some(entry) = by_date.get_mut(contribution.date()) else {
                    log::warn!(
                        "calendar_source_out_of_range source={} date={}",
                        source.id(),
                        contribution.date()
                    );
                    continue;
                };
                match contribution {
                    CalendarContribution::Holiday { annotation, .. } => {
                        if !entry.holidays.contains(&annotation) {
                            entry.holidays.push(annotation);
                        }
                    }
                    CalendarContribution::Events { events, .. } => {
                        for event in events {
                            if !entry.events.contains(&event) {
                                entry.events.push(event);
                            }
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
        Ok(by_date.into_values().collect())
    }
}

fn calendar_days(range: CalendarRange) -> BTreeMap<String, CalendarDay> {
    let mut days = BTreeMap::new();
    let mut date = range.start();
    loop {
        let annotations = annotations_for(date);
        let key = date.to_string();
        days.insert(
            key.clone(),
            CalendarDay {
                date: key,
                lunar_date: annotations.lunar_date,
                solar_term: annotations.solar_term,
                holidays: Vec::new(),
                events: Vec::new(),
                todos: Vec::new(),
            },
        );
        if date == range.end() {
            break;
        }
        date = date
            .succ_opt()
            .expect("validated calendar range always has a next date");
    }
    days
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
    async fn returns_every_date_with_lunar_annotations_when_sources_are_empty() {
        let calls = Arc::new(AtomicUsize::new(0));
        let service = CalendarService::new(vec![Arc::new(FakeSource {
            id: "empty",
            requirement: CalendarSourceRequirement::Required,
            result: Ok(Vec::new()),
            calls,
        })]);

        let result = service
            .query(CalendarRangeRequest {
                start_date: "2026-04-04".into(),
                end_date: "2026-04-06".into(),
            })
            .await
            .unwrap();

        assert_eq!(
            result
                .iter()
                .map(|day| day.date.as_str())
                .collect::<Vec<_>>(),
            vec!["2026-04-04", "2026-04-05", "2026-04-06"]
        );
        assert!(result.iter().all(|day| day.lunar_date.is_some()));
        assert_eq!(result[1].solar_term.as_deref(), Some("清明"));
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
