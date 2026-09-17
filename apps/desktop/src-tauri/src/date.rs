use chrono::NaiveDate;

const LOCAL_DATE_FORMAT: &str = "%Y-%m-%d";

pub(crate) fn parse_local_date(value: &str) -> Result<NaiveDate, ()> {
    let date = NaiveDate::parse_from_str(value, LOCAL_DATE_FORMAT).map_err(|_| ())?;
    (format_local_date(date) == value).then_some(date).ok_or(())
}

pub(crate) fn format_local_date(date: NaiveDate) -> String {
    date.format(LOCAL_DATE_FORMAT).to_string()
}

#[cfg(test)]
mod tests {
    use super::{format_local_date, parse_local_date};

    #[test]
    fn parses_and_formats_strict_local_dates() {
        let date = parse_local_date("2028-02-29").unwrap();

        assert_eq!(format_local_date(date), "2028-02-29");
        assert!(parse_local_date("2026-02-29").is_err());
        assert!(parse_local_date("2026-2-09").is_err());
    }
}
