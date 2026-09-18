use cnlunar::{solar_term_on, LunarDate};

fn parse_ymd(s: &str) -> (i32, u8, u8) {
    let parts: Vec<u32> = s.split('-').map(|p| p.parse().unwrap()).collect();
    (parts[0] as i32, parts[1] as u8, parts[2] as u8)
}

/// 对照原 Python 库（cnlunar）生成的黄金数据逐条验证农历转换。
/// 数据覆盖：1901/1902/2099/2100 边界整年、每年春节 ±7 天、
/// 全部 73 个闰月的所有日期、5000 个随机日期。
#[test]
fn lunar_matches_python() {
    let text = include_str!("fixtures/lunar.txt");
    let mut count = 0usize;
    for line in text.lines() {
        let (solar, rest) = line.split_once('=').unwrap();
        let (y, m, d) = parse_ymd(solar);
        let expected: Vec<u32> = rest.split(',').map(|p| p.parse().unwrap()).collect();
        let lunar = LunarDate::from_solar(y, m, d)
            .unwrap_or_else(|| panic!("from_solar({solar}) 返回 None"));
        assert_eq!(lunar.year as u32, expected[0], "year 不符 @ {solar}");
        assert_eq!(lunar.month as u32, expected[1], "month 不符 @ {solar}");
        assert_eq!(lunar.day as u32, expected[2], "day 不符 @ {solar}");
        assert_eq!(lunar.is_leap, expected[3] == 1, "is_leap 不符 @ {solar}");
        count += 1;
    }
    assert!(count > 10_000, "fixture 疑似缺失: {count}");
}

/// 对照原 Python 库生成的 4800 个节气日期（200 年 × 24 节气），
/// 并断言每个节气前后一天都不是节气（数据保证节气间隔 ≥ 14 天）。
#[test]
fn solar_terms_match_python() {
    let text = include_str!("fixtures/solar_terms.txt");
    let mut count = 0usize;
    for line in text.lines() {
        let (date, name) = line.split_once('=').unwrap();
        let (y, m, d) = parse_ymd(date);
        assert_eq!(solar_term_on(y, m, d), Some(name), "{date}");
        assert_eq!(solar_term_on(y, m, d - 1), None, "{date} 前一天应为无节气");
        assert_eq!(solar_term_on(y, m, d + 1), None, "{date} 后一天应为无节气");
        count += 1;
    }
    assert_eq!(count, 4_800, "fixture 疑似缺失: {count}");
}

/// 支持范围边界（上游农历数据止于农历 2099 年）。
#[test]
fn range_edges() {
    assert!(LunarDate::from_solar(1901, 2, 18).is_none());
    assert!(LunarDate::from_solar(1901, 2, 19).is_some());
    assert!(LunarDate::from_solar(2100, 2, 8).is_some());
    assert!(LunarDate::from_solar(2100, 2, 9).is_none());
    assert!(LunarDate::from_solar(2100, 12, 31).is_none());
    assert!(LunarDate::from_solar(2101, 1, 1).is_none());
}
