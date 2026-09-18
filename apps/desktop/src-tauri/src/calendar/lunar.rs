use chrono::{Datelike, NaiveDate};
use cnlunar::{solar_term_on, LunarDate};

use super::LunarDateSummary;

pub(super) struct ChineseCalendarAnnotations {
    pub lunar_date: Option<LunarDateSummary>,
    pub solar_term: Option<String>,
}

pub(super) fn annotations_for(date: NaiveDate) -> ChineseCalendarAnnotations {
    let year = date.year();
    let month = date.month() as u8;
    let day = date.day() as u8;
    ChineseCalendarAnnotations {
        lunar_date: LunarDate::from_solar(year, month, day).map(|lunar| LunarDateSummary {
            year: lunar.year,
            month: lunar.month,
            day: lunar.day,
            is_leap_month: lunar.is_leap,
            month_name: lunar.month_name(),
            day_name: lunar.day_name().to_owned(),
        }),
        solar_term: solar_term_on(year, month, day).map(str::to_owned),
    }
}

#[cfg(test)]
mod tests {
    use chrono::NaiveDate;

    use super::annotations_for;

    #[test]
    fn calculates_lunar_dates_and_solar_terms() {
        let lunar_new_year = annotations_for(NaiveDate::from_ymd_opt(2026, 2, 17).unwrap());
        let lunar = lunar_new_year.lunar_date.unwrap();
        assert_eq!((lunar.year, lunar.month, lunar.day), (2026, 1, 1));
        assert_eq!(lunar.month_name, "正月");
        assert_eq!(lunar.day_name, "初一");

        let qingming = annotations_for(NaiveDate::from_ymd_opt(2026, 4, 5).unwrap());
        assert_eq!(qingming.solar_term.as_deref(), Some("清明"));
    }

    #[test]
    fn keeps_independent_validity_ranges() {
        let annotations = annotations_for(NaiveDate::from_ymd_opt(2100, 12, 22).unwrap());

        assert!(annotations.lunar_date.is_none());
        assert_eq!(annotations.solar_term.as_deref(), Some("冬至"));
    }
}
