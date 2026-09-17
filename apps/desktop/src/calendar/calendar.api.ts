import { invokeGetCalendarDays } from '@/lib/invoke';
import type { CalendarRangeRequest } from './calendar.types';

export const CALENDAR_DAYS_QUERY_KEY = ['calendar-days'] as const;

export const calendarDaysQueryKey = (request: CalendarRangeRequest) =>
  [...CALENDAR_DAYS_QUERY_KEY, request.start_date, request.end_date] as const;

export const getCalendarDaysApi = (request: CalendarRangeRequest) => invokeGetCalendarDays(request);
