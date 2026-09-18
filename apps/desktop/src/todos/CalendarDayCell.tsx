import { format, isSameDay, isSameMonth } from 'date-fns';

import { cn } from '@/lib/utils';
import type { CalendarDay, CalendarEventSummary } from '@/calendar/calendar.types';
import { colorStyleForText } from '@/lib/text-color';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

interface CalendarDayCellProps {
  date: Date;
  month: Date;
  today: Date;
  selectedDate: Date;
  calendarDay?: CalendarDay;
  onSelect: (date: Date) => void;
  onCreate: (date: Date) => void;
  onEdit: (event: CalendarEventSummary, date: Date) => void;
}

export default function CalendarDayCell({
  date,
  month,
  today,
  selectedDate,
  calendarDay,
  onSelect,
  onCreate,
  onEdit,
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
        selected && 'bg-accent',
      )}
    >
      <div className="mb-1 flex min-w-0 items-center gap-1">
        <div
          className={cn(
            'flex size-7 shrink-0 items-center justify-center rounded-full text-sm',
            isToday && 'text-primary',
            selected && 'bg-primary text-primary-foreground ring-[3px] ring-ring/50',
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
      <TooltipProvider delay={300}>
        <div className="mt-1 flex flex-col gap-1">
          {(calendarDay?.events ?? []).map((event) => (
            <Tooltip key={event.id}>
              <TooltipTrigger
                render={
                  <div
                    className="truncate rounded-md px-2 py-1 text-xs font-medium transition-all hover:-translate-y-px hover:shadow-sm"
                    style={colorStyleForText(event.title)}
                    onClick={(clickEvent) => {
                      clickEvent.stopPropagation();
                      onEdit(event, date);
                    }}
                    onDoubleClick={(clickEvent) => clickEvent.stopPropagation()}
                  >
                    {event.title}
                  </div>
                }
              />
              <TooltipContent>{event.title}</TooltipContent>
            </Tooltip>
          ))}
        </div>
      </TooltipProvider>
    </div>
  );
}
