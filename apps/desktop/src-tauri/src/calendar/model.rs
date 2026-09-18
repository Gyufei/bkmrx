#[cfg(test)]
mod tests {
    use super::{
        CalendarDay, CalendarEventType, CalendarHolidayDayType, CalendarRangeRequest,
        CalendarTodoDateType, LunarDateSummary,
    };

    #[test]
    fn serializes_the_calendar_day_contract() {
        let day = CalendarDay {
            date: "2026-10-01".into(),
            lunar_date: Some(LunarDateSummary {
                year: 2026,
                month: 8,
                day: 21,
                is_leap_month: false,
                month_name: "八月".into(),
                day_name: "廿一".into(),
            }),
            solar_term: None,
            holidays: Vec::new(),
            events: Vec::new(),
            todos: Vec::new(),
        };

        assert_eq!(
            serde_json::to_value(day).unwrap(),
            serde_json::json!({
                "date": "2026-10-01",
                "lunar_date": {
                    "year": 2026,
                    "month": 8,
                    "day": 21,
                    "is_leap_month": false,
                    "month_name": "八月",
                    "day_name": "廿一"
                },
                "solar_term": null,
                "holidays": [],
                "events": [],
                "todos": []
            })
        );
        assert_eq!(
            serde_json::to_value(CalendarHolidayDayType::AdjustedWorkday).unwrap(),
            "adjusted_workday"
        );
        assert_eq!(
            serde_json::to_value(CalendarEventType::Anniversary).unwrap(),
            "anniversary"
        );
        assert_eq!(
            serde_json::to_value(CalendarTodoDateType::Due).unwrap(),
            "due"
        );
    }

    #[test]
    fn validates_inclusive_calendar_ranges() {
        let range = CalendarRangeRequest {
            start_date: "2026-09-28".into(),
            end_date: "2026-11-08".into(),
        }
        .validate()
        .unwrap();

        assert_eq!(range.start().to_string(), "2026-09-28");
        assert_eq!(range.end().to_string(), "2026-11-08");
    }

    #[test]
    fn rejects_reversed_or_oversized_calendar_ranges() {
        let reversed = CalendarRangeRequest {
            start_date: "2026-10-02".into(),
            end_date: "2026-10-01".into(),
        };
        let oversized = CalendarRangeRequest {
            start_date: "2026-01-01".into(),
            end_date: "2027-01-02".into(),
        };

        assert!(reversed.validate().is_err());
        assert!(oversized.validate().is_err());
    }
}
use chrono::NaiveDate;
use serde::{Deserialize, Serialize};

use crate::{
    date::parse_local_date,
    error::{AppError, AppResult},
};

const MAX_RANGE_DAYS: i64 = 366;

#[derive(Debug, Clone, Deserialize, PartialEq, Eq)]
pub struct CalendarRangeRequest {
    pub start_date: String,
    pub end_date: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct CalendarRange {
    start: NaiveDate,
    end: NaiveDate,
}

impl CalendarRangeRequest {
    pub fn validate(&self) -> AppResult<CalendarRange> {
        let start = parse_local_date(&self.start_date)
            .map_err(|_| AppError::validation_error("Calendar dates must use YYYY-MM-DD"))?;
        let end = parse_local_date(&self.end_date)
            .map_err(|_| AppError::validation_error("Calendar dates must use YYYY-MM-DD"))?;
        let days = end.signed_duration_since(start).num_days();
        if !(0..MAX_RANGE_DAYS).contains(&days) {
            return Err(AppError::validation_error(
                "Calendar date range must be ordered and no longer than 366 days",
            ));
        }
        Ok(CalendarRange { start, end })
    }
}

impl CalendarRange {
    pub fn start(self) -> NaiveDate {
        self.start
    }

    pub fn end(self) -> NaiveDate {
        self.end
    }

    pub fn contains(self, date: NaiveDate) -> bool {
        date >= self.start && date <= self.end
    }
}

#[derive(Debug, Clone, Copy, Serialize, PartialEq, Eq, Hash)]
#[serde(rename_all = "snake_case")]
pub enum CalendarHolidayDayType {
    DayOff,
    AdjustedWorkday,
    Observance,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, Default)]
#[serde(rename_all = "snake_case")]
pub enum CalendarEventType {
    Work,
    Personal,
    Anniversary,
    #[default]
    Other,
}

impl CalendarEventType {
    pub(crate) fn as_str(self) -> &'static str {
        match self {
            Self::Work => "work",
            Self::Personal => "personal",
            Self::Anniversary => "anniversary",
            Self::Other => "other",
        }
    }
    pub(crate) fn from_db(value: &str) -> Option<Self> {
        match value {
            "work" => Some(Self::Work),
            "personal" => Some(Self::Personal),
            "anniversary" => Some(Self::Anniversary),
            "other" => Some(Self::Other),
            _ => None,
        }
    }
}

#[derive(Debug, Clone, Copy, Serialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum CalendarTodoDateType {
    Start,
    Due,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq, Hash)]
pub struct HolidayAnnotation {
    pub name: String,
    pub display_name: String,
    pub day_type: CalendarHolidayDayType,
    pub source: String,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
pub struct CalendarEventSummary {
    pub id: String,
    pub title: String,
    pub event_type: CalendarEventType,
    pub source: String,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
pub struct CalendarTodoSummary {
    pub id: String,
    pub title: String,
    pub date_type: CalendarTodoDateType,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
pub struct LunarDateSummary {
    pub year: i32,
    pub month: u8,
    pub day: u8,
    pub is_leap_month: bool,
    pub month_name: String,
    pub day_name: String,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
pub struct CalendarDay {
    pub date: String,
    pub lunar_date: Option<LunarDateSummary>,
    pub solar_term: Option<String>,
    pub holidays: Vec<HolidayAnnotation>,
    pub events: Vec<CalendarEventSummary>,
    pub todos: Vec<CalendarTodoSummary>,
}
