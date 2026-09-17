export enum CalendarHolidayDayType {
  DayOff = 'day_off',
  AdjustedWorkday = 'adjusted_workday',
  Observance = 'observance',
}

export enum CalendarEventType {
  Work = 'work',
  Personal = 'personal',
  Anniversary = 'anniversary',
  Other = 'other',
}

export enum CalendarTodoDateType {
  Start = 'start',
  Due = 'due',
}

export interface CalendarRangeRequest {
  start_date: string;
  end_date: string;
}

export interface HolidayAnnotation {
  name: string;
  display_name: string;
  day_type: CalendarHolidayDayType;
  source: string;
}

export interface CalendarEventSummary {
  id: string;
  title: string;
  event_type: CalendarEventType;
  source: string;
}

export interface CalendarTodoSummary {
  id: string;
  title: string;
  date_type: CalendarTodoDateType;
}

export interface CalendarDay {
  date: string;
  holidays: HolidayAnnotation[];
  events: CalendarEventSummary[];
  todos: CalendarTodoSummary[];
}
