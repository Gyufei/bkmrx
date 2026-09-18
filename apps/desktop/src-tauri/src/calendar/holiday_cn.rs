use std::{
    collections::{BTreeMap, HashSet},
    future::Future,
    pin::Pin,
    sync::Arc,
    time::Duration,
};

use chrono::{Datelike, NaiveDate};
use reqwest::{header, StatusCode};
use serde::Deserialize;

use crate::safe_http::{get, RequestOptions};

use super::{
    cache::RawYearCache, CalendarContribution, CalendarHolidayDayType, CalendarRange,
    CalendarSource, CalendarSourceRequirement, HolidayAnnotation, SourceFuture,
};

const SOURCE_ID: &str = "holiday-cn";
const BASE_URL: &str = "https://raw.githubusercontent.com/NateScarlet/holiday-cn/master";
const MAX_BODY_BYTES: usize = 1024 * 1024;
const REQUEST_TIMEOUT: Duration = Duration::from_secs(15);
const USER_AGENT: &str = concat!("bkmrx/", env!("CARGO_PKG_VERSION"), " calendar");

pub type FetchFuture<'a> = Pin<Box<dyn Future<Output = Result<Vec<u8>, String>> + Send + 'a>>;

pub trait HolidayCnDocumentFetcher: Send + Sync {
    fn fetch<'a>(&'a self, year: i32) -> FetchFuture<'a>;
}

#[derive(Debug, Default)]
pub struct HolidayCnFetcher;

impl HolidayCnDocumentFetcher for HolidayCnFetcher {
    fn fetch<'a>(&'a self, year: i32) -> FetchFuture<'a> {
        Box::pin(async move {
            let mut headers = header::HeaderMap::new();
            headers.insert(
                header::USER_AGENT,
                header::HeaderValue::from_static(USER_AGENT),
            );
            headers.insert(
                header::ACCEPT,
                header::HeaderValue::from_static("application/json"),
            );
            let url = format!("{BASE_URL}/{year}.json");
            let response = get(
                &url,
                RequestOptions {
                    timeout: REQUEST_TIMEOUT,
                    max_bytes: MAX_BODY_BYTES,
                    https_only: true,
                    headers,
                    credential: None,
                },
            )
            .await
            .map_err(|error| format!("request failed: {error}"))?;
            if response.status() != StatusCode::OK {
                return Err(format!("HTTP {}", response.status()));
            }
            response.bytes().await.map_err(|error| error.to_string())
        })
    }
}

pub struct HolidayCnSource {
    cache: RawYearCache,
    fetcher: Arc<dyn HolidayCnDocumentFetcher>,
}

impl HolidayCnSource {
    pub fn new(
        cache_dir: std::path::PathBuf,
        fetcher: Arc<dyn HolidayCnDocumentFetcher>,
        freshness: Duration,
    ) -> Self {
        Self {
            cache: RawYearCache::new(cache_dir, freshness),
            fetcher,
        }
    }

    async fn load_year(&self, year: i32) -> Result<Option<HolidayCnDocument>, String> {
        let cached = self.cache.read(year);
        let cached_document = cached
            .as_ref()
            .and_then(|entry| parse_document(year, &entry.bytes).ok());
        if cached.as_ref().is_some_and(|entry| entry.is_fresh) {
            if let Some(document) = cached_document {
                return Ok(Some(document));
            }
        }

        let bytes = match self.fetcher.fetch(year).await {
            Ok(bytes) => bytes,
            Err(error) => return stale_or_error(cached_document, year, error),
        };
        match parse_document(year, &bytes) {
            Ok(document) => {
                if let Err(error) = self.cache.write(year, &bytes) {
                    log::warn!(
                        "calendar_cache_write_failed source={SOURCE_ID} year={year} error_code={}",
                        error.code()
                    );
                }
                Ok(Some(document))
            }
            Err(DocumentError::Empty) => Ok(None),
            Err(DocumentError::Invalid(error)) => stale_or_error(cached_document, year, error),
        }
    }

    async fn load_range(&self, range: CalendarRange) -> Result<Vec<CalendarContribution>, String> {
        let years = source_years(range);
        let mut annotations = BTreeMap::<String, Vec<HolidayAnnotation>>::new();
        let mut seen = HashSet::new();
        for year in years {
            let document = match self.load_year(year).await {
                Ok(Some(document)) => document,
                Ok(None) => continue,
                Err(error) => {
                    log::warn!("calendar_source_year_unavailable source={SOURCE_ID} year={year} error={error}");
                    continue;
                }
            };
            for item in document.days {
                if !range.contains(item.date) {
                    continue;
                }
                let day_type = if item.is_off_day {
                    CalendarHolidayDayType::DayOff
                } else {
                    CalendarHolidayDayType::AdjustedWorkday
                };
                let key = (item.date, item.name.clone(), day_type);
                if !seen.insert(key) {
                    continue;
                }
                annotations
                    .entry(item.date.to_string())
                    .or_default()
                    .push(HolidayAnnotation {
                        display_name: if item.is_off_day {
                            item.name.clone()
                        } else {
                            format!("{}调休", item.name)
                        },
                        name: item.name,
                        day_type,
                        source: SOURCE_ID.into(),
                    });
            }
        }
        Ok(annotations
            .into_iter()
            .flat_map(|(date, holidays)| {
                holidays
                    .into_iter()
                    .map(move |annotation| CalendarContribution::Holiday {
                        date: date.clone(),
                        annotation,
                    })
            })
            .collect())
    }
}

fn stale_or_error(
    cached: Option<HolidayCnDocument>,
    year: i32,
    error: String,
) -> Result<Option<HolidayCnDocument>, String> {
    if let Some(document) = cached {
        log::warn!("calendar_source_refresh_failed source={SOURCE_ID} year={year} fallback=stale error={error}");
        Ok(Some(document))
    } else {
        Err(error)
    }
}

impl CalendarSource for HolidayCnSource {
    fn id(&self) -> &str {
        SOURCE_ID
    }

    fn requirement(&self) -> CalendarSourceRequirement {
        CalendarSourceRequirement::Optional
    }

    fn load<'a>(&'a self, range: CalendarRange) -> SourceFuture<'a> {
        Box::pin(self.load_range(range))
    }
}

fn source_years(range: CalendarRange) -> Vec<i32> {
    let first = range.start().year();
    let last = range.end().year();
    (first..=last + 1).collect()
}

#[derive(Deserialize)]
struct RawDocument {
    year: i32,
    #[allow(dead_code)]
    papers: Vec<String>,
    days: Vec<RawDay>,
}

#[derive(Deserialize)]
struct RawDay {
    name: String,
    date: String,
    #[serde(rename = "isOffDay")]
    is_off_day: bool,
}

struct HolidayCnDocument {
    days: Vec<HolidayCnDay>,
}

struct HolidayCnDay {
    name: String,
    date: NaiveDate,
    is_off_day: bool,
}

enum DocumentError {
    Empty,
    Invalid(String),
}

fn parse_document(expected_year: i32, bytes: &[u8]) -> Result<HolidayCnDocument, DocumentError> {
    let raw: RawDocument =
        serde_json::from_slice(bytes).map_err(|error| DocumentError::Invalid(error.to_string()))?;
    if raw.year != expected_year {
        return Err(DocumentError::Invalid(
            "source year does not match document year".into(),
        ));
    }
    if raw.days.is_empty() {
        return Err(DocumentError::Empty);
    }
    let days = raw
        .days
        .into_iter()
        .map(|day| {
            if day.name.trim().is_empty() {
                return Err(DocumentError::Invalid("holiday name is empty".to_owned()));
            }
            let date = NaiveDate::parse_from_str(&day.date, "%Y-%m-%d")
                .map_err(|_| DocumentError::Invalid("holiday date is invalid".to_owned()))?;
            Ok(HolidayCnDay {
                name: day.name,
                date,
                is_off_day: day.is_off_day,
            })
        })
        .collect::<Result<Vec<_>, _>>()?;
    Ok(HolidayCnDocument { days })
}

#[cfg(test)]
mod tests {
    use std::{
        collections::BTreeMap,
        sync::{Arc, Mutex},
        time::Duration,
    };

    use tempfile::tempdir;

    use super::{HolidayCnDocumentFetcher, HolidayCnSource};
    use crate::calendar::{
        CalendarContribution, CalendarHolidayDayType, CalendarRangeRequest, CalendarSource,
        CalendarSourceRequirement, HolidayAnnotation,
    };

    #[derive(Default)]
    struct FakeFetcher {
        documents: Mutex<BTreeMap<i32, Result<Vec<u8>, String>>>,
        years: Mutex<Vec<i32>>,
    }

    impl FakeFetcher {
        fn with_document(self, year: i32, json: &str) -> Self {
            self.documents
                .lock()
                .unwrap()
                .insert(year, Ok(json.as_bytes().to_vec()));
            self
        }
    }

    impl HolidayCnDocumentFetcher for FakeFetcher {
        fn fetch<'a>(&'a self, year: i32) -> super::FetchFuture<'a> {
            Box::pin(async move {
                self.years.lock().unwrap().push(year);
                self.documents
                    .lock()
                    .unwrap()
                    .remove(&year)
                    .unwrap_or_else(|| Err("unavailable".into()))
            })
        }
    }

    fn document(year: i32, days: &str) -> String {
        format!(r#"{{"year":{year},"papers":[],"days":[{days}]}}"#)
    }

    fn annotations(contributions: &[CalendarContribution]) -> Vec<&HolidayAnnotation> {
        contributions
            .iter()
            .filter_map(|contribution| match contribution {
                CalendarContribution::Holiday { annotation, .. } => Some(annotation),
                _ => None,
            })
            .collect()
    }

    #[tokio::test]
    async fn normalizes_adjusted_workdays_and_loads_the_following_source_year() {
        let directory = tempdir().unwrap();
        let fetcher = Arc::new(
            FakeFetcher::default()
                .with_document(
                    2026,
                    &document(
                        2026,
                        r#"{"name":"国庆节","date":"2026-10-01","isOffDay":true}"#,
                    ),
                )
                .with_document(
                    2027,
                    &document(
                        2027,
                        r#"{"name":"元旦","date":"2026-12-31","isOffDay":false}"#,
                    ),
                ),
        );
        let source = HolidayCnSource::new(
            directory.path().into(),
            fetcher.clone(),
            Duration::from_secs(0),
        );
        let range = CalendarRangeRequest {
            start_date: "2026-10-01".into(),
            end_date: "2026-12-31".into(),
        }
        .validate()
        .unwrap();

        let days = source.load(range).await.unwrap();

        assert_eq!(*fetcher.years.lock().unwrap(), vec![2026, 2027]);
        let annotations = annotations(&days);
        assert_eq!(annotations.len(), 2);
        assert_eq!(annotations[0].display_name, "国庆节");
        assert_eq!(annotations[1].display_name, "元旦调休");
        assert_eq!(
            annotations[1].day_type,
            CalendarHolidayDayType::AdjustedWorkday
        );
    }

    #[tokio::test]
    async fn keeps_distinct_names_removes_duplicates_and_filters_out_of_range_records() {
        let directory = tempdir().unwrap();
        let duplicate = r#"{"name":"节日甲","date":"2026-10-01","isOffDay":true},{"name":"节日甲","date":"2026-10-01","isOffDay":true},{"name":"节日乙","date":"2026-10-01","isOffDay":true}"#;
        let fetcher = Arc::new(
            FakeFetcher::default()
                .with_document(2026, &document(2026, duplicate))
                .with_document(
                    2027,
                    &document(
                        2027,
                        r#"{"name":"未来","date":"2027-01-01","isOffDay":true}"#,
                    ),
                ),
        );
        let source = HolidayCnSource::new(directory.path().into(), fetcher, Duration::from_secs(0));
        let range = CalendarRangeRequest {
            start_date: "2026-10-01".into(),
            end_date: "2026-10-01".into(),
        }
        .validate()
        .unwrap();

        let days = source.load(range).await.unwrap();

        let annotations = annotations(&days);
        assert_eq!(
            annotations
                .iter()
                .map(|item| item.name.as_str())
                .collect::<Vec<_>>(),
            vec!["节日甲", "节日乙"]
        );
    }

    #[tokio::test]
    async fn reuses_stale_cache_when_refresh_fails() {
        let directory = tempdir().unwrap();
        let cache_dir = directory.path().join("holiday-cn");
        std::fs::create_dir_all(&cache_dir).unwrap();
        std::fs::write(
            cache_dir.join("2026.json"),
            document(
                2026,
                r#"{"name":"缓存节日","date":"2026-10-01","isOffDay":true}"#,
            ),
        )
        .unwrap();
        let fetcher = Arc::new(FakeFetcher::default().with_document(
            2027,
            &document(
                2027,
                r#"{"name":"未来","date":"2027-01-01","isOffDay":true}"#,
            ),
        ));
        let source = HolidayCnSource::new(cache_dir, fetcher, Duration::from_secs(0));
        let range = CalendarRangeRequest {
            start_date: "2026-10-01".into(),
            end_date: "2026-10-01".into(),
        }
        .validate()
        .unwrap();

        let days = source.load(range).await.unwrap();

        assert_eq!(annotations(&days)[0].name, "缓存节日");
    }

    #[tokio::test]
    async fn fresh_cache_avoids_network_requests() {
        let directory = tempdir().unwrap();
        let cache_dir = directory.path().join("holiday-cn");
        std::fs::create_dir_all(&cache_dir).unwrap();
        std::fs::write(
            cache_dir.join("2026.json"),
            document(
                2026,
                r#"{"name":"缓存节日","date":"2026-10-01","isOffDay":true}"#,
            ),
        )
        .unwrap();
        std::fs::write(
            cache_dir.join("2027.json"),
            document(
                2027,
                r#"{"name":"未来","date":"2027-01-01","isOffDay":true}"#,
            ),
        )
        .unwrap();
        let fetcher = Arc::new(FakeFetcher::default());
        let source = HolidayCnSource::new(
            cache_dir,
            fetcher.clone(),
            Duration::from_secs(7 * 24 * 60 * 60),
        );
        let range = CalendarRangeRequest {
            start_date: "2026-10-01".into(),
            end_date: "2026-10-01".into(),
        }
        .validate()
        .unwrap();

        let days = source.load(range).await.unwrap();

        assert_eq!(annotations(&days)[0].name, "缓存节日");
        assert!(fetcher.years.lock().unwrap().is_empty());
    }

    #[tokio::test]
    async fn empty_refresh_returns_no_data_without_replacing_nonempty_cache() {
        let directory = tempdir().unwrap();
        let cache_dir = directory.path().join("holiday-cn");
        std::fs::create_dir_all(&cache_dir).unwrap();
        let cached = document(
            2026,
            r#"{"name":"缓存节日","date":"2026-10-01","isOffDay":true}"#,
        );
        std::fs::write(cache_dir.join("2026.json"), &cached).unwrap();
        let fetcher = Arc::new(
            FakeFetcher::default()
                .with_document(2026, &document(2026, ""))
                .with_document(
                    2027,
                    &document(
                        2027,
                        r#"{"name":"未来","date":"2027-01-01","isOffDay":true}"#,
                    ),
                ),
        );
        let source = HolidayCnSource::new(cache_dir.clone(), fetcher, Duration::from_secs(0));
        let range = CalendarRangeRequest {
            start_date: "2026-10-01".into(),
            end_date: "2026-10-01".into(),
        }
        .validate()
        .unwrap();

        let days = source.load(range).await.unwrap();

        assert!(days.is_empty());
        assert_eq!(
            std::fs::read_to_string(cache_dir.join("2026.json")).unwrap(),
            cached
        );
    }

    #[test]
    fn is_an_optional_calendar_source() {
        let directory = tempdir().unwrap();
        let source = HolidayCnSource::new(
            directory.path().into(),
            Arc::new(FakeFetcher::default()),
            Duration::from_secs(0),
        );

        assert_eq!(source.requirement(), CalendarSourceRequirement::Optional);
    }
}
