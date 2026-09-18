//! 农历与二十四节气查询库。
//!
//! 移植自 Python 库 [OPN48/cnLunar](https://github.com/OPN48/cnLunar)（MIT License），
//! 仅保留农历与节气功能；数据来源为香港天文台，覆盖 1901 ~ 2100 年。
//!
//! - 农历转换支持 1901-02-19 至 2100-02-08（上游农历数据表止于农历 2099 年）；
//! - 节气查询支持 1901 ~ 2100 整个公历年，精度为日。
//!
//! ```rust
//! use cnlunar::{solar_term_on, LunarDate};
//!
//! let lunar = LunarDate::from_solar(2026, 2, 17).unwrap();
//! assert_eq!(lunar.month_name(), "正月");
//! assert_eq!(lunar.day_name(), "初一");
//! assert_eq!(lunar.year_cn(), "二零二六");
//!
//! assert_eq!(solar_term_on(2026, 4, 5), Some("清明"));
//! ```

pub mod data;
mod lunar;
mod solar_terms;

pub use lunar::LunarDate;
pub use solar_terms::{next_solar_term, solar_term_on, year_term_days, SolarTerm};
