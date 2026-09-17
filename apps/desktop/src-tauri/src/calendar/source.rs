use std::{future::Future, pin::Pin};

use super::{CalendarDay, CalendarRange};

pub type SourceFuture<'a> =
    Pin<Box<dyn Future<Output = Result<Vec<CalendarDay>, String>> + Send + 'a>>;

pub trait CalendarSource: Send + Sync {
    fn id(&self) -> &str;
    fn load<'a>(&'a self, range: CalendarRange) -> SourceFuture<'a>;
}
