import {
  invokeCreateCalendarEvent,
  invokeDeleteCalendarEvent,
  invokeGetCalendarDays,
  invokeUpdateCalendarEvent,
} from '@/lib/invoke';
import type {
  CalendarRangeRequest,
  CreateCalendarEvent,
  UpdateCalendarEvent,
} from './calendar.types';

export const CALENDAR_DAYS_QUERY_KEY = ['calendar-days'] as const;

export const calendarDaysQueryKey = (request: CalendarRangeRequest) =>
  [...CALENDAR_DAYS_QUERY_KEY, request.start_date, request.end_date] as const;

export const getCalendarDaysApi = (request: CalendarRangeRequest) => invokeGetCalendarDays(request);
export const createCalendarEventApi = (input: CreateCalendarEvent) =>
  invokeCreateCalendarEvent(input);
export const updateCalendarEventApi = (id: string, input: UpdateCalendarEvent) =>
  invokeUpdateCalendarEvent(id, input);
export const deleteCalendarEventApi = (id: string) => invokeDeleteCalendarEvent(id);
