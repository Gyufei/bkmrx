import { format, isSameDay, isSameMonth } from 'date-fns';

import { cn } from '@/lib/utils';
import type { CalendarDay } from '@/calendar/calendar.types';

export interface CalendarEvent {
  id: number;
  title: string;
  date: Date;
}

interface CalendarDayCellProps {
  date: Date;
  month: Date;
  today: Date;
  selectedDate: Date;
  events: CalendarEvent[];
  calendarDay?: CalendarDay;
  onSelect: (date: Date) => void;
  onCreate: (date: Date) => void;
}

export default function CalendarDayCell({
  date,
  month,
  today,
  selectedDate,
  events,
  calendarDay,
  onSelect,
  onCreate,
}: CalendarDayCellProps) {
  const selected = isSameDay(date, selectedDate);
  const isToday = isSameDay(date, today);

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={format(date, 'yyyy年M月d日')}
      aria-pressed={selected}
      onClick={() => onSelect(date)}
      onDoubleClick={() => onCreate(date)}
      onKeyDown={(event) => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        onSelect(date);
      }}
      className={cn(
        'group min-h-0 cursor-pointer overflow-hidden border-r border-b border-border p-2 text-left transition-colors hover:bg-primary/10 focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring',
        !isSameMonth(date, month) && 'bg-muted/60 text-muted-foreground',
        selected && 'bg-primary/20',
      )}
    >
      <div className="mb-1 flex min-w-0 items-center gap-1">
        <div
          className={cn(
            'flex size-7 shrink-0 items-center justify-center rounded-full text-sm',
            isToday && 'bg-primary/10 font-medium text-primary',
            selected && 'bg-primary font-medium text-primary-foreground',
          )}
        >
          {format(date, 'd')}
        </div>
        {calendarDay && calendarDay.holidays.length > 0 && (
          <span className="truncate text-xs text-muted-foreground">
            {calendarDay.holidays.map((holiday) => holiday.display_name).join(' / ')}
          </span>
        )}
      </div>
      <div className="flex flex-col gap-1">
        {events.map((event) => (
          <div
            key={event.id}
            className="truncate rounded-md bg-primary/12 px-2 py-1 text-xs font-medium text-primary"
          >
            {event.title}
          </div>
        ))}
      </div>
    </div>
  );
}
