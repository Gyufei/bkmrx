# cnlunar

农历与二十四节气查询的 Rust 本地 crate，移植自 [OPN48/cnlunar](https://github.com/OPN48/cnlunar)（MIT）。

仅保留两个功能，其余（八字、干支、神煞、宜忌、节日等）均未移植：

- **农历**：公历 → 农历日期（含闰月判断、中文月名/日名/年份数字）
- **节气**：二十四节气按年查询、当天节气、下一节气

数据来自香港天文台《1901–2100 公历与农历对照表》：

- **农历**：有效公历范围为 **1901-02-19 至 2100-02-08**（上游数据表只到农历 2099 年，2100-02-09 起原 Python 库即会崩溃，Rust 侧如实返回 `None`）
- **节气**：有效范围为 1901 至 2100 全年

范围外返回 `None`。

零依赖（纯 std）。测试 fixture 由原 Python 库生成，保证逐日一致。

```rust
use cnlunar::{LunarDate, solar_term_on, next_solar_term};

let lunar = LunarDate::from_solar(2026, 2, 17).unwrap();
assert_eq!(lunar.month_name(), "正月");
assert_eq!(lunar.day_name(), "初一");

assert_eq!(solar_term_on(2026, 4, 5), Some("清明"));
```
