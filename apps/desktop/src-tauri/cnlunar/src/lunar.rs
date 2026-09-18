//! 公历 <-> 农历转换。

use crate::data::{END_YEAR, LUNAR_END_YEAR, LUNAR_MONTH_DATA, LUNAR_NEW_YEAR, START_YEAR};

/// 农历月份名称（1~12 月）。
pub const LUNAR_MONTH_NAMES: [&str; 12] = [
    "正月", "二月", "三月", "四月", "五月", "六月", "七月", "八月", "九月", "十月", "冬月", "腊月",
];

/// 农历日期名称（初一到三十）。
pub const LUNAR_DAY_NAMES: [&str; 30] = [
    "初一", "初二", "初三", "初四", "初五", "初六", "初七", "初八", "初九", "初十", "十一", "十二",
    "十三", "十四", "十五", "十六", "十七", "十八", "十九", "二十", "廿一", "廿二", "廿三", "廿四",
    "廿五", "廿六", "廿七", "廿八", "廿九", "三十",
];

const CN_DIGITS: [&str; 10] = ["零", "一", "二", "三", "四", "五", "六", "七", "八", "九"];

/// 一个农历年的月历信息：12 个月各自的天数，以及闰月编号（0 = 无闰月）与闰月天数。
struct YearMonths {
    days: [u8; 12],
    leap_month: u8,
    leap_days: u8,
}

/// 某农历年的月历数据；`lunar_year` 超出 1901~2099（上游数据表止于 2099）返回 `None`。
fn year_months(lunar_year: i32) -> Option<YearMonths> {
    if !(START_YEAR..=LUNAR_END_YEAR).contains(&lunar_year) {
        return None;
    }
    let v = LUNAR_MONTH_DATA[(lunar_year - START_YEAR) as usize];
    let mut days = [0u8; 12];
    for (i, slot) in days.iter_mut().enumerate() {
        *slot = 29 + ((v >> i) & 1) as u8;
    }
    Some(YearMonths {
        days,
        leap_month: ((v >> 13) & 0xf) as u8,
        leap_days: 29 + ((v >> 12) & 1) as u8,
    })
}

/// 农历 `lunar_year` 年正月初一的公历日期序数（以 1970-01-01 为 0）。
fn cny_ordinal(lunar_year: i32) -> Option<i64> {
    let v = *LUNAR_NEW_YEAR.get((lunar_year - START_YEAR) as usize)?;
    let month = ((v >> 5) & 0x3) as u32;
    let day = (v & 0x1f) as u32;
    Some(days_from_civil(lunar_year, month, day))
}

/// 一个公历日期对应的农历日期。
///
/// 支持范围：1901-02-19（1901 年正月初一）至 2100-02-08（2099 年腊月三十），
/// 范围外或日期非法返回 `None`。
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct LunarDate {
    /// 农历年
    pub year: i32,
    /// 农历月（1~12）
    pub month: u8,
    /// 农历日（1~30）
    pub day: u8,
    /// 是否闰月
    pub is_leap: bool,
}

impl LunarDate {
    /// 公历日期转农历。`month` 为 1~12，`day` 为当月有效日。
    pub fn from_solar(year: i32, month: u8, day: u8) -> Option<Self> {
        if !(START_YEAR..=END_YEAR).contains(&year) || !(1..=12).contains(&month) {
            return None;
        }
        if !(1..=days_in_month(year, month)).contains(&day) {
            return None;
        }
        let solar = days_from_civil(year, month as u32, day as u32);
        let cny = cny_ordinal(year)?;
        // 春节前属于上一个农历年
        let (lunar_year, cny) = if solar < cny {
            let prev = year - 1;
            (prev, cny_ordinal(prev)?)
        } else {
            (year, cny)
        };
        // 从正月初一开始按月推进；span 已保证小于该农历年总天数
        // （solar < 次年春节，而次年春节的序数总是可查），故循环必在 12 月内结束。
        let months = year_months(lunar_year)?;
        let mut span = solar - cny;
        for month in 1u8..=12 {
            let md = months.days[(month - 1) as usize] as i64;
            if span < md {
                return Some(LunarDate {
                    year: lunar_year,
                    month,
                    day: span as u8 + 1,
                    is_leap: false,
                });
            }
            span -= md;
            if month == months.leap_month {
                let ld = months.leap_days as i64;
                if span < ld {
                    return Some(LunarDate {
                        year: lunar_year,
                        month,
                        day: span as u8 + 1,
                        is_leap: true,
                    });
                }
                span -= ld;
            }
        }
        None
    }

    /// 当前农历月的天数（29 或 30）。
    pub fn month_days(&self) -> u8 {
        let months = year_months(self.year).expect("LunarDate 的年份必有月历数据");
        if self.is_leap {
            months.leap_days
        } else {
            months.days[(self.month - 1) as usize]
        }
    }

    /// 月份中文名，如 `正月`、`闰六月`。
    pub fn month_name(&self) -> String {
        let name = LUNAR_MONTH_NAMES[(self.month - 1) as usize];
        if self.is_leap {
            format!("闰{name}")
        } else {
            name.to_string()
        }
    }

    /// 日期中文名，如 `初一`。
    pub fn day_name(&self) -> &'static str {
        LUNAR_DAY_NAMES[(self.day - 1) as usize]
    }

    /// 年份中文读法，如 `二零二六`。
    pub fn year_cn(&self) -> String {
        let mut s = String::new();
        for b in self.year.to_string().bytes() {
            s.push_str(CN_DIGITS[(b - b'0') as usize]);
        }
        s
    }
}

/// Howard Hinnant 的 days_from_civil 算法：公历日期到日期序数（1970-01-01 = 0）。
fn days_from_civil(y: i32, m: u32, d: u32) -> i64 {
    let y = i64::from(y) - i64::from(m <= 2);
    let era = y.div_euclid(400);
    let yoe = y - era * 400;
    let mp = (i64::from(m) + 9) % 12;
    let doy = (153 * mp + 2) / 5 + i64::from(d) - 1;
    let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
    era * 146097 + doe - 719_468
}

fn is_leap_year(y: i32) -> bool {
    (y % 4 == 0 && y % 100 != 0) || y % 400 == 0
}

/// `month` 须为 1~12，由调用方保证。
fn days_in_month(year: i32, month: u8) -> u8 {
    match month {
        1 | 3 | 5 | 7 | 8 | 10 | 12 => 31,
        4 | 6 | 9 | 11 => 30,
        2 if is_leap_year(year) => 29,
        2 => 28,
        _ => unreachable!("month 已校验为 1~12"),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn civil_ordinal_anchors() {
        assert_eq!(days_from_civil(1970, 1, 1), 0);
        assert_eq!(days_from_civil(2024, 1, 1), 19_723);
    }

    #[test]
    fn converts_known_dates() {
        // 2026-02-17 为 2026 年正月初一
        let d = LunarDate::from_solar(2026, 2, 17).unwrap();
        assert_eq!(
            d,
            LunarDate {
                year: 2026,
                month: 1,
                day: 1,
                is_leap: false
            }
        );
        assert_eq!(d.month_name(), "正月");
        assert_eq!(d.day_name(), "初一");
        assert_eq!(d.year_cn(), "二零二六");
    }

    #[test]
    fn supports_up_to_lunar_data_end() {
        // 农历月数据止于 2099 年：2100-02-08 是 2099 年腊月三十，再往后无数据
        let d = LunarDate::from_solar(2100, 2, 8).unwrap();
        assert_eq!(
            d,
            LunarDate {
                year: 2099,
                month: 12,
                day: 30,
                is_leap: false
            }
        );
        assert!(LunarDate::from_solar(2100, 2, 9).is_none());
        // 1901-02-19 是 1901 年正月初一
        assert_eq!(
            LunarDate::from_solar(1901, 2, 19).unwrap(),
            LunarDate {
                year: 1901,
                month: 1,
                day: 1,
                is_leap: false
            }
        );
        assert!(LunarDate::from_solar(1901, 2, 18).is_none());
    }

    #[test]
    fn rejects_invalid_dates() {
        assert!(LunarDate::from_solar(2026, 2, 30).is_none());
        assert!(LunarDate::from_solar(2026, 13, 1).is_none());
        assert!(LunarDate::from_solar(2026, 0, 1).is_none());
        assert!(LunarDate::from_solar(2025, 2, 29).is_none());
        assert!(LunarDate::from_solar(2024, 2, 29).is_some());
    }

    #[test]
    fn names() {
        let leap = LunarDate {
            year: 2025,
            month: 6,
            day: 1,
            is_leap: true,
        };
        assert_eq!(leap.month_name(), "闰六月");
        assert_eq!(
            LunarDate {
                year: 2026,
                month: 12,
                day: 30,
                is_leap: false
            }
            .month_name(),
            "腊月"
        );
        assert_eq!(
            LunarDate {
                year: 2026,
                month: 1,
                day: 15,
                is_leap: false
            }
            .day_name(),
            "十五"
        );
        assert_eq!(
            LunarDate {
                year: 2026,
                month: 1,
                day: 30,
                is_leap: false
            }
            .day_name(),
            "三十"
        );
        assert_eq!(
            LunarDate {
                year: 1901,
                month: 1,
                day: 1,
                is_leap: false
            }
            .year_cn(),
            "一九零一"
        );
    }

    #[test]
    fn month_days_sum_matches_year_length() {
        // 农历年总天数应等于相邻两年春节的间隔
        for lunar_year in START_YEAR..=LUNAR_END_YEAR {
            let months = year_months(lunar_year).unwrap();
            let mut total = months.days.iter().map(|&d| i64::from(d)).sum::<i64>();
            if months.leap_month > 0 {
                total += i64::from(months.leap_days);
            }
            let next_cny = cny_ordinal(lunar_year + 1).unwrap();
            assert_eq!(
                total,
                next_cny - cny_ordinal(lunar_year).unwrap(),
                "year {lunar_year}"
            );
        }
    }
}
