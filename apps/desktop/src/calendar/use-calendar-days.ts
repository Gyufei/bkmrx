import { useQuery } from '@tanstack/react-query';

import { calendarDaysQueryKey, getCalendarDaysApi } from './calendar.api';
import type { CalendarRangeRequest } from './calendar.types';

export function useCalendarDays(request: CalendarRangeRequest) {
  return useQuery({
    queryKey: calendarDaysQueryKey(request),
    queryFn: () => getCalendarDaysApi(request),
  });
}
