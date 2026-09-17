# Calendar Holiday Source Design

Date: 2026-09-17

## Status

Implemented with contract, source/cache, service, command, and frontend rendering tests.

## Background

The Todo calendar currently renders a fixed six-week month grid and keeps temporary event names in frontend state. It needs holiday annotations from [`NateScarlet/holiday-cn`](https://github.com/NateScarlet/holiday-cn), while leaving room for additional calendar sources, user events, and Todo date projections.

The upstream dataset is organized by source year rather than by the visible date range. It also contains adjusted workdays and can publish late-December arrangements in the following year's document. These provider-specific facts must remain behind the backend boundary.

## Goals

- Query calendar information by the date range actually visible in the UI.
- Download and cache raw yearly `holiday-cn` JSON documents.
- Normalize source-specific records into one extensible Calendar Day contract.
- Render holiday labels after the date number in each calendar cell.
- Isolate source failures so the calendar grid remains usable.
- Establish seams for more calendar sources without exposing their rules to the frontend.

## Non-goals

- Calendar source settings, enable switches, manual refresh, or custom source URLs.
- Persisted user events or Todo projections; their arrays are present but empty in this version.
- Event recurrence rules.
- Holiday filtering, source-specific colors, or interactive holiday details.
- A cache database, cache metadata file, background scheduler, or cross-process cache coordination.

## Design summary

```text
TodoCalendarPage
  -> get_calendar_days({ start_date, end_date })
    -> CalendarService
      -> CalendarSource[]
        -> HolidayCnSource
          -> raw yearly cache
          -> HTTPS holiday-cn document fetcher
          -> provider DTO validation and normalization
      -> deduplicate, group by date, filter to requested range
  <- CalendarDay[]
```

The public interface is intentionally small: callers provide an inclusive local-date range and receive only Calendar Days that contain information. `CalendarService` and each source own the mechanics required to produce that answer.

## Public contract

The Tauri command is conceptually:

```rust
get_calendar_days(request: CalendarRangeRequest) -> Result<Vec<CalendarDay>, String>
```

```ts
interface CalendarRangeRequest {
  start_date: string;
  end_date: string;
}

enum CalendarHolidayDayType {
  DayOff = "day_off",
  AdjustedWorkday = "adjusted_workday",
  Observance = "observance",
}

enum CalendarEventType {
  Work = "work",
  Personal = "personal",
  Anniversary = "anniversary",
  Other = "other",
}

enum CalendarTodoDateType {
  Start = "start",
  Due = "due",
}

interface HolidayAnnotation {
  name: string;
  display_name: string;
  day_type: CalendarHolidayDayType;
  source: string;
}

interface CalendarEventSummary {
  id: string;
  title: string;
  event_type: CalendarEventType;
  source: string;
}

interface CalendarTodoSummary {
  id: string;
  title: string;
  date_type: CalendarTodoDateType;
}

interface CalendarDay {
  date: string;
  holidays: HolidayAnnotation[];
  events: CalendarEventSummary[];
  todos: CalendarTodoSummary[];
}
```

Dates use the strict `YYYY-MM-DD` form and represent local civil dates, not instants. The request range is inclusive. The command rejects malformed dates, `start_date > end_date`, and ranges longer than one year. The range limit prevents an accidental request from expanding into unbounded network and filesystem work while leaving room for future year views.

Rust enums use `serde(rename_all = "snake_case")`. TypeScript defines the same enum values independently. Serialization contract tests make drift visible; code generation is unnecessary for this small contract.

Only days with at least one non-empty collection are returned. In the first version, `events` and `todos` are always empty arrays.

## Backend module boundary

Add a cohesive `src-tauri/src/calendar/` module:

```text
calendar/
  mod.rs          public construction and exports
  model.rs        normalized request, response, and enum types
  service.rs      range validation, source isolation, aggregation
  source.rs       CalendarSource contract
  cache.rs        raw yearly document cache
  holiday_cn.rs   provider DTO, year selection, fetch, normalization
```

`CalendarService` depends on a collection of `CalendarSource` implementations. A source accepts a validated range and returns normalized Calendar Days or annotations. Its stable `source` value is a string, such as `holiday-cn`, rather than an enum; adding a source must not require changing the shared type system.

The source abstraction has two real implementations from the outset:

- `HolidayCnSource`, used in production.
- An in-memory source used by service-level tests.

The HTTP boundary inside `HolidayCnSource` is also injectable so tests never depend on GitHub availability. The production implementation uses the existing `safe_http` client. Cache behavior is tested against a temporary application-data directory.

This boundary keeps range queries shallow for callers while concentrating provider URL construction, cross-year knowledge, cache policy, validation, and normalization inside the provider adapter.

## Source document retrieval

The canonical document URL is:

```text
https://raw.githubusercontent.com/NateScarlet/holiday-cn/master/{year}.json
```

The request uses the existing safe HTTP layer with:

- HTTPS required.
- Redirect and public-address validation inherited from `safe_http`.
- An explicit timeout and bounded response size.
- `Accept: application/json` and an application User-Agent.
- A successful HTTP status requirement before parsing.

The provider DTO preserves the upstream shape:

```json
{
  "year": 2026,
  "papers": [],
  "days": [
    { "name": "国庆节", "date": "2026-10-01", "isOffDay": true }
  ]
}
```

A document is accepted only when:

- JSON parsing succeeds.
- Its `year` matches the requested source year.
- `days` is non-empty.
- Every record has a valid local date and non-empty name.

A malformed record invalidates the document rather than silently producing partial calendar facts.

## Source-year expansion

For a visible range, `HolidayCnSource` loads:

1. Every natural year touched by the range.
2. The year immediately after the maximum visible year.

The second document is required because the upstream project may publish late-December arrangements in the following year's file. Source-year results are merged, exact duplicates are removed, and only records whose actual `date` is inside the requested range survive.

This rule belongs exclusively to `HolidayCnSource`; neither the Tauri command nor the frontend knows that upstream data is yearly or that a following-year lookup is required.

## Raw cache policy

Raw documents live alongside other application data under:

```text
{app_data_dir}/calendars/holiday-cn/{year}.json
```

The cache deliberately stores the upstream JSON unchanged. Normalization runs after every read, allowing the normalized model to evolve without redownloading valid source data.

File modification time is the only freshness metadata. A file is fresh for seven days.

For each source year:

| State | Behavior |
| --- | --- |
| Fresh, valid cache | Read and normalize it without a network request. |
| Stale, valid cache | Fetch synchronously; atomically replace on success; reuse stale data on fetch failure. |
| Missing or invalid cache | Fetch; use the response when valid. |
| Fresh fetch has empty `days` | Treat it as no data, do not cache it, and do not replace a prior non-empty file. |
| Fresh data but cache write fails | Return the fresh normalized data, log the write failure, and retry on a later query. |
| No usable cache and fetch fails | Omit that source's contribution and keep the calendar usable. |

Cache replacement uses the existing `fsutil::write_atomically` helper. A corrupted cache is treated as a miss and never returned. Version one does not add single-flight locking: atomic replacement prevents corruption, and the frontend query layer already coalesces normal component usage.

## Normalization and aggregation

Each accepted `holiday-cn` record becomes one `HolidayAnnotation`:

| Upstream value | `day_type` | `display_name` |
| --- | --- | --- |
| `isOffDay: true` | `day_off` | Original `name` |
| `isOffDay: false` | `adjusted_workday` | Original `name` followed by `调休` |

`name` always retains the original provider name and `source` is `holiday-cn`. `observance` is reserved for future sources and is not produced by this adapter.

An exact duplicate has the same `source`, `date`, `name`, and `day_type`. Exact duplicates are removed. Distinct annotations on the same date remain distinct and preserve a deterministic source/document order. The backend does not concatenate presentation strings.

`CalendarService` merges successful source results by date and fills the future-facing arrays:

```json
{
  "date": "2026-10-01",
  "holidays": [
    {
      "name": "国庆节",
      "display_name": "国庆节",
      "day_type": "day_off",
      "source": "holiday-cn"
    }
  ],
  "events": [],
  "todos": []
}
```

One source failing does not fail other sources or the command. Invalid request input remains a command error because it is a caller defect, not source unavailability.

## Frontend integration

Create a small frontend calendar data module with the contract types, invoke wrapper, query key, and query hook. Its query key includes both inclusive range endpoints.

`TodoCalendarPage` already computes the 42 displayed dates. It uses the first and last cell dates as `start_date` and `end_date`, then indexes returned Calendar Days by date. Changing month therefore changes the range and query key.

The grid renders immediately while source data loads. Missing source data is equivalent to an empty annotation list; it never blocks navigation or date selection.

`CalendarDayCell` receives the matching normalized Calendar Day separately from the page's temporary in-memory item-name prototype. For each cell it renders:

```text
1 国庆节 / 其他名称
```

The label is placed immediately after the date number, uses small muted text, and joins every `display_name` with ` / `. Day-off and adjusted-workday annotations use the same visual treatment in version one. Existing selected, today, outside-month, and hover styles remain authoritative for the cell background.

The frontend never interprets `isOffDay`, appends `调休`, infers cross-year data, or recognizes provider identifiers. Those are backend responsibilities.

## Error handling and observability

- Log provider, source year, requested range, and failure category; do not log complete payloads.
- Treat network, HTTP status, body limit, parse, validation, and cache I/O failures as distinct internal categories.
- Do not surface a global error banner for an unavailable optional calendar source.
- Keep request validation failures observable to the caller and tests.
- Never log settings, unrelated application data, or response bodies.

## Security and attribution

- All remote data is untrusted and is validated before entering the normalized model.
- The existing safe HTTP client protects against non-public destinations and unsafe redirects.
- Response size and date-range bounds limit resource consumption.
- Source URLs are fixed in version one; no user-controlled URL is accepted.
- Preserve the upstream MIT copyright and license notice in the repository's third-party notices or equivalent attribution location when implementation adds the dependency/data-source notice.

## Test strategy

Tests are organized around stable interfaces rather than private helpers.

### Rust contract tests

- Every enum serializes to its agreed snake-case value.
- A Calendar Day serializes with all three arrays, including empty arrays.
- Valid and invalid inclusive date ranges are distinguished.

### `HolidayCnSource` tests

- `isOffDay` maps to `day_off` or `adjusted_workday` and produces the correct display name.
- Visible years plus the maximum visible year plus one are requested once each.
- Following-year documents may contribute records dated in the prior December.
- Out-of-range records are removed.
- Exact duplicates are removed while distinct names remain.
- Empty and malformed documents are rejected.

### Cache tests

- Fresh cache avoids the fetcher.
- Stale cache is replaced atomically after a successful fetch.
- Stale valid cache is reused after a fetch failure.
- Empty responses neither create nor replace cache files.
- Corrupt cache falls back to the fetcher.
- A cache-write failure does not discard valid fresh data.

### Service and command tests

- Multiple source results merge by date.
- One failing source does not hide successful source data.
- Days with all arrays empty are omitted.
- Invalid command input returns an error without invoking sources.

### Frontend tests

- The query uses the first and last visible grid dates.
- Month changes produce a new query range.
- A cell renders all `display_name` values joined with ` / `.
- No annotation produces no placeholder label.
- Existing selection, today, outside-month, and hover interactions remain unchanged.

No automated test reaches the live GitHub endpoint. A manual development verification may use one known source year after the deterministic test suite passes.

## Implementation sequence

1. Add failing serialization and normalization contract tests, then implement normalized Rust types.
2. Add failing source-year and mapping tests, then implement the injectable `HolidayCnSource` adapter.
3. Add cache behavior tests, then add raw cache reads, seven-day freshness, and atomic writes.
4. Add aggregation and failure-isolation tests, then implement `CalendarService`.
5. Add the Tauri command and frontend invoke/query contract with request-boundary tests.
6. Add cell rendering tests, then connect the 42-day grid to normalized Calendar Days.
7. Run Rust and frontend focused suites, formatting, linting, and a manual month-boundary check.

## Alternatives rejected

- **Fetch in the frontend:** leaks provider mechanics, complicates filesystem caching, and makes future sources harder to combine.
- **Expose source years to callers:** makes a provider storage detail part of the application contract.
- **Cache normalized output:** couples cached data to the current model and requires cache migrations or forced refetches.
- **Return all 42 Calendar Days:** duplicates a view concern and forces the backend to manufacture empty aggregates.
- **Flatten holidays, events, and Todos into one item array:** loses type-specific semantics and makes later features depend on optional-field combinations.
- **Use an enum for source identity:** every new third-party source would require a shared contract change even though source identifiers are open-ended.
