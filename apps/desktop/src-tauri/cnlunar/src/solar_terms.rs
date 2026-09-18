//! 二十四节气查询。

use crate::data::{END_YEAR, SOLAR_TERMS_DATA, START_YEAR, TERM_MIN_DAY};

/// 二十四节气名称，索引顺序与数据表一致（从小寒到冬至）。
pub const SOLAR_TERM_NAMES: [&str; 24] = [
    "小寒", "大寒", "立春", "雨水", "惊蛰", "春分", "清明", "谷雨", "立夏", "小满", "芒种", "夏至",
    "小暑", "大暑", "立秋", "处暑", "白露", "秋分", "寒露", "霜降", "立冬", "小雪", "大雪", "冬至",
];

/// 一个节气在某年的具体日期（仅精确到日，与数据来源一致）。
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct SolarTerm {
    pub name: &'static str,
    pub year: i32,
    pub month: u8,
    pub day: u8,
}

/// 节气 `t`（0=小寒）所在月份，恒为 `t/2 + 1`。
fn term_month(t: usize) -> u8 {
    (t / 2 + 1) as u8
}

/// 返回某年 24 个节气各自在所在月中的日期（索引顺序同 [`SOLAR_TERM_NAMES`]，
/// 节气 `t` 的月份为 `t/2 + 1`）。年份超出 1901~2100 返回 `None`。
pub fn year_term_days(year: i32) -> Option<[u8; 24]> {
    if !(START_YEAR..=END_YEAR).contains(&year) {
        return None;
    }
    let data = SOLAR_TERMS_DATA[(year - START_YEAR) as usize];
    let mut days = [0u8; 24];
    for (t, slot) in days.iter_mut().enumerate() {
        *slot = (((data >> (2 * t)) & 3) as u8) + TERM_MIN_DAY[t];
    }
    Some(days)
}

/// 某公历日期当天是否为节气，是则返回节气名。
pub fn solar_term_on(year: i32, month: u8, day: u8) -> Option<&'static str> {
    if !(1..=12).contains(&month) {
        return None;
    }
    let days = year_term_days(year)?;
    for (t, &term_day) in days.iter().enumerate() {
        if term_month(t) == month && term_day == day {
            return Some(SOLAR_TERM_NAMES[t]);
        }
    }
    None
}

/// 给定日期之后（不含当天）的第一个节气；若当年冬至之后则返回次年小寒。
pub fn next_solar_term(year: i32, month: u8, day: u8) -> Option<SolarTerm> {
    if !(1..=12).contains(&month) {
        return None;
    }
    let days = year_term_days(year)?;
    for (t, &term_day) in days.iter().enumerate() {
        let tm = term_month(t);
        if tm > month || (tm == month && term_day > day) {
            return Some(SolarTerm {
                name: SOLAR_TERM_NAMES[t],
                year,
                month: tm,
                day: term_day,
            });
        }
    }
    next_solar_term(year + 1, 1, 0)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn decodes_2026_terms() {
        let days = year_term_days(2026).unwrap();
        assert_eq!(days[0], 5); // 小寒 1/5
        assert_eq!(days[6], 5); // 清明 4/5
        assert_eq!(days[23], 22); // 冬至 12/22
        assert!(year_term_days(1900).is_none());
        assert!(year_term_days(2101).is_none());
    }

    #[test]
    fn term_on_matches_known_dates() {
        assert_eq!(solar_term_on(2026, 4, 5), Some("清明"));
        assert_eq!(solar_term_on(2025, 4, 4), Some("清明"));
        assert_eq!(solar_term_on(2026, 4, 4), None);
        assert_eq!(solar_term_on(2100, 12, 31), None);
    }

    #[test]
    fn next_term_is_strictly_after() {
        let next = next_solar_term(2026, 4, 5).unwrap();
        assert_eq!(
            next,
            SolarTerm {
                name: "谷雨",
                year: 2026,
                month: 4,
                day: 20
            }
        );

        let next = next_solar_term(2026, 1, 4).unwrap();
        assert_eq!(
            next,
            SolarTerm {
                name: "小寒",
                year: 2026,
                month: 1,
                day: 5
            }
        );

        // 冬至当天 → 次年小寒
        let next = next_solar_term(2026, 12, 22).unwrap();
        assert_eq!(
            next,
            SolarTerm {
                name: "小寒",
                year: 2027,
                month: 1,
                day: 5
            }
        );

        // 2100 冬至之后无数据
        assert!(next_solar_term(2100, 12, 25).is_none());
    }
}
