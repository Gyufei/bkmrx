use std::{future::Future, pin::Pin};

use super::{CalendarEventSummary, CalendarRange, CalendarTodoSummary, HolidayAnnotation};

pub type SourceFuture<'a> =
    Pin<Box<dyn Future<Output = Result<Vec<CalendarContribution>, String>> + Send + 'a>>;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum CalendarSourceRequirement {
    Required,
    Optional,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum CalendarContribution {
    Holiday {
        date: String,
        annotation: HolidayAnnotation,
    },
    Event {
        date: String,
        event: CalendarEventSummary,
    },
    Todo {
        date: String,
        todo: CalendarTodoSummary,
    },
}

impl CalendarContribution {
    pub(crate) fn date(&self) -> &str {
        match self {
            Self::Holiday { date, .. } | Self::Event { date, .. } | Self::Todo { date, .. } => date,
        }
    }
}

pub trait CalendarSource: Send + Sync {
    fn id(&self) -> &str;
    fn requirement(&self) -> CalendarSourceRequirement;
    fn load<'a>(&'a self, range: CalendarRange) -> SourceFuture<'a>;
}
