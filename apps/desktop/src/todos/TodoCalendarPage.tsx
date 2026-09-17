import { useMemo, useState } from 'react';
import {
  addMonths,
  addDays,
  eachDayOfInterval,
  format,
  isSameDay,
  isSameMonth,
  startOfMonth,
  startOfWeek,
} from 'date-fns';
import { zhCN } from 'date-fns/locale';
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react';

import { useCalendarDays } from '@/calendar/use-calendar-days';
import CollapsibleSidebar from '@/components/CollapsibleSidebar';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { formatLocalDate } from '@/lib/date';
import CalendarDayCell, { type CalendarEvent } from './CalendarDayCell';

const WEEKDAYS = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];

function getMonthDays(month: Date) {
  const start = startOfWeek(startOfMonth(month), { weekStartsOn: 1 });
  return eachDayOfInterval({
    start,
    end: addDays(start, 41),
  });
}

export default function TodoCalendarPage() {
  const today = useMemo(() => new Date(), []);
  const [month, setMonth] = useState(() => startOfMonth(today));
  const [selectedDate, setSelectedDate] = useState(today);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [eventTitle, setEventTitle] = useState('');
  const monthDays = useMemo(() => getMonthDays(month), [month]);
  const calendarRequest = useMemo(
    () => ({
      start_date: formatLocalDate(monthDays[0]),
      end_date: formatLocalDate(monthDays[monthDays.length - 1]),
    }),
    [monthDays],
  );
  const calendarDays = useCalendarDays(calendarRequest);
  const calendarDaysByDate = useMemo(
    () => new Map((calendarDays.data ?? []).map((day) => [day.date, day])),
    [calendarDays.data],
  );

  const selectDate = (date: Date) => {
    setSelectedDate(date);
    if (!isSameMonth(date, month)) setMonth(startOfMonth(date));
  };

  const openCreateDialog = (date = selectedDate) => {
    selectDate(date);
    setEventTitle('');
    setDialogOpen(true);
  };

  const addEvent = () => {
    const title = eventTitle.trim();
    if (!title) return;
    setEvents((current) => [...current, { id: Date.now(), title, date: new Date(selectedDate) }]);
    setDialogOpen(false);
    setEventTitle('');
  };

  const changeMonth = (offset: number) => {
    setMonth((current) => addMonths(current, offset));
    setSelectedDate((current) => addMonths(current, offset));
  };

  const sidebarTitle = (
    <div className="flex min-w-0 flex-1 items-center justify-center gap-1">
      <Button variant="ghost" size="icon-xs" aria-label="上个月" onClick={() => changeMonth(-1)}>
        <ChevronLeft />
      </Button>
      <span className="min-w-24 truncate text-center">
        {format(month, 'yyyy年 M月', { locale: zhCN })}
      </span>
      <Button variant="ghost" size="icon-xs" aria-label="下个月" onClick={() => changeMonth(1)}>
        <ChevronRight />
      </Button>
    </div>
  );

  return (
    <div className="flex min-h-0 flex-1 overflow-hidden">
      <CollapsibleSidebar
        title={sidebarTitle}
        className="w-72"
        contentClassName="flex flex-col px-3 pb-3"
      >
        <Calendar
          mode="single"
          month={month}
          selected={selectedDate}
          onMonthChange={setMonth}
          onSelect={(date) => date && selectDate(date)}
          locale={zhCN}
          weekStartsOn={1}
          showOutsideDays={false}
          className="w-full bg-transparent p-0 [--cell-size:--spacing(8)]"
          classNames={{
            nav: 'hidden',
            month_caption: 'hidden',
            today: 'rounded-(--cell-radius) text-primary',
            day_button: '!mx-auto !size-7 !min-w-0 rounded-full',
          }}
        />
        <Button className="mt-4 w-full" onClick={() => openCreateDialog()}>
          <Plus data-icon="inline-start" />
          添加事项
        </Button>
      </CollapsibleSidebar>

      <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-background">
        <div className="grid shrink-0 grid-cols-7 border-b border-border bg-muted/20">
          {WEEKDAYS.map((weekday) => (
            <div
              key={weekday}
              className="border-r border-border px-3 py-2 text-center text-xs font-medium text-muted-foreground last:border-r-0"
            >
              {weekday}
            </div>
          ))}
        </div>
        <div className="grid min-h-0 flex-1 grid-cols-7 grid-rows-6 overflow-hidden">
          {monthDays.map((date) => {
            const dayEvents = events.filter((event) => isSameDay(event.date, date));
            return (
              <CalendarDayCell
                key={date.toISOString()}
                date={date}
                month={month}
                today={today}
                selectedDate={selectedDate}
                events={dayEvents}
                calendarDay={calendarDaysByDate.get(formatLocalDate(date))}
                onSelect={selectDate}
                onCreate={openCreateDialog}
              />
            );
          })}
        </div>
      </main>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>添加事项</DialogTitle>
          </DialogHeader>
          <form
            className="flex flex-col gap-4"
            onSubmit={(event) => {
              event.preventDefault();
              addEvent();
            }}
          >
            <Input
              autoFocus
              aria-label="事项名称"
              value={eventTitle}
              onChange={(event) => setEventTitle(event.target.value)}
              placeholder="输入事项名称"
            />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                取消
              </Button>
              <Button type="submit" disabled={!eventTitle.trim()}>
                添加
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
