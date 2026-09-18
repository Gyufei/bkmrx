import { format, isSameDay } from 'date-fns';

import { CalendarHolidayDayType, type CalendarDay } from './calendar.types';
import { cn } from '@/lib/utils';

interface CalendarDayHeaderProps {
  date: Date;
  today: Date;
  selectedDate: Date;
  calendarDay?: CalendarDay;
}

function calendarAnnotation(day?: CalendarDay) {
  if (day?.solar_term) return day.solar_term;
  if (!day?.lunar_date) return null;
  return day.lunar_date.day === 1 ? day.lunar_date.month_name : day.lunar_date.day_name;
}

export default function CalendarDayHeader({
  date,
  today,
  selectedDate,
  calendarDay,
}: CalendarDayHeaderProps) {
  const annotation = calendarAnnotation(calendarDay);
  return (
    <div className="mb-1 flex min-w-0 items-center justify-between gap-2">
      <div className="flex min-w-0 items-center gap-1.5">
        <div
          className={cn(
            'flex size-7 shrink-0 items-center justify-center rounded-full text-sm',
            isSameDay(date, today) && 'text-primary',
            isSameDay(date, selectedDate) &&
              'bg-primary text-primary-foreground ring-[3px] ring-ring/50',
          )}
        >
          {format(date, 'd')}
        </div>
        {annotation && <span className="truncate text-xs text-muted-foreground">{annotation}</span>}
      </div>
      {calendarDay && calendarDay.holidays.length > 0 && (
        <div className="flex min-w-0 items-center justify-end gap-1 truncate text-xs">
          {calendarDay.holidays.map((holiday, index) => (
            <span
              key={`${holiday.source}-${holiday.name}-${holiday.day_type}`}
              className={cn(
                'truncate',
                holiday.day_type === CalendarHolidayDayType.AdjustedWorkday
                  ? 'text-destructive'
                  : 'text-chart-5',
              )}
            >
              {index > 0 && <span className="mr-1 text-muted-foreground">/</span>}
              {holiday.display_name}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
