import { format, isSameDay, isSameMonth } from 'date-fns';

import { cn } from '@/lib/utils';
import type { CalendarDay, CalendarEventSummary } from '@/calendar/calendar.types';
import { colorStyleForText } from '@/lib/text-color';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import CalendarDayHeader from './CalendarDayHeader';

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
        !isSameMonth(date, month) && 'bg-accent text-muted-foreground',
        selected && 'outline-1 -outline-offset-1 outline-primary',
      )}
    >
      <CalendarDayHeader
        date={date}
        today={today}
        selectedDate={selectedDate}
        calendarDay={calendarDay}
      />
      <TooltipProvider delay={300}>
        <div className="mt-1.5 flex flex-col gap-1">
          {(calendarDay?.events ?? []).map((event) => (
            <Tooltip key={event.id}>
              <TooltipTrigger
                render={
                  <div
                    className="truncate rounded-xs px-2 py-1 text-xs font-medium transition-all hover:-translate-y-px hover:shadow-sm border-l-2 border-current"
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
