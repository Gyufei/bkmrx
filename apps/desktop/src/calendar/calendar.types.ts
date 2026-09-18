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

export interface CalendarEvent extends CalendarEventSummary {
  date: string;
  created_at: string;
  updated_at: string;
}

export interface CreateCalendarEvent {
  title: string;
  date: string;
  event_type: CalendarEventType;
}

export type UpdateCalendarEvent = CreateCalendarEvent;

export interface CalendarTodoSummary {
  id: string;
  title: string;
  date_type: CalendarTodoDateType;
}

export interface LunarDateSummary {
  year: number;
  month: number;
  day: number;
  is_leap_month: boolean;
  month_name: string;
  day_name: string;
}

export interface CalendarDay {
  date: string;
  lunar_date: LunarDateSummary | null;
  solar_term: string | null;
  holidays: HolidayAnnotation[];
  events: CalendarEventSummary[];
  todos: CalendarTodoSummary[];
}
