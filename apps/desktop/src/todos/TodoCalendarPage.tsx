import { useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  addMonths,
  addDays,
  eachDayOfInterval,
  format,
  isSameMonth,
  startOfMonth,
  startOfWeek,
} from 'date-fns';
import { zhCN } from 'date-fns/locale';
import { Check, ChevronDown, ChevronLeft, ChevronRight, Plus } from 'lucide-react';

import {
  createCalendarEventApi,
  deleteCalendarEventApi,
  updateCalendarEventApi,
} from '@/calendar/calendar.api';
import { CALENDAR_DAYS_QUERY_KEY } from '@/calendar/calendar.api';
import { CalendarEventType, type CalendarEventSummary } from '@/calendar/calendar.types';
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
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { toast } from '@/components/ui/toast';
import { formatLocalDate } from '@/lib/date';
import CalendarDayCell from './CalendarDayCell';

const WEEKDAYS = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];
const EVENT_TYPE_OPTIONS = [
  { value: CalendarEventType.Work, label: '工作' },
  { value: CalendarEventType.Personal, label: '个人' },
  { value: CalendarEventType.Anniversary, label: '纪念日' },
  { value: CalendarEventType.Other, label: '其他' },
] as const;

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
  const [dialogOpen, setDialogOpen] = useState(false);
  const [eventTitle, setEventTitle] = useState('');
  const [eventType, setEventType] = useState(CalendarEventType.Other);
  const [eventTypeOpen, setEventTypeOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState<CalendarEventSummary | null>(null);
  const queryClient = useQueryClient();
  const refreshCalendar = () =>
    queryClient.invalidateQueries({ queryKey: CALENDAR_DAYS_QUERY_KEY });
  const createEvent = useMutation({
    mutationFn: createCalendarEventApi,
    onSuccess: refreshCalendar,
  });
  const updateEvent = useMutation({
    mutationFn: ({
      id,
      title,
      date,
      eventType,
    }: {
      id: string;
      title: string;
      date: string;
      eventType: CalendarEventType;
    }) => updateCalendarEventApi(id, { title, date, event_type: eventType }),
    onSuccess: refreshCalendar,
  });
  const deleteEvent = useMutation({
    mutationFn: deleteCalendarEventApi,
    onSuccess: refreshCalendar,
  });
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
    setEditingEvent(null);
    setEventTitle('');
    setEventType(CalendarEventType.Other);
    setDialogOpen(true);
  };

  const saveEvent = async () => {
    const title = eventTitle.trim();
    if (!title) return;
    const date = formatLocalDate(selectedDate);
    try {
      if (editingEvent)
        await updateEvent.mutateAsync({
          id: editingEvent.id,
          title,
          date,
          eventType,
        });
      else await createEvent.mutateAsync({ title, date, event_type: eventType });
      setDialogOpen(false);
      setEventTitle('');
    } catch {
      toast.add({ type: 'error', title: editingEvent ? '事件修改失败' : '事件添加失败' });
    }
  };

  const openEditDialog = (event: CalendarEventSummary, date: Date) => {
    selectDate(date);
    setEditingEvent(event);
    setEventTitle(event.title);
    setEventType(event.event_type);
    setDialogOpen(true);
  };

  const removeEvent = async () => {
    if (!editingEvent) return;
    try {
      await deleteEvent.mutateAsync(editingEvent.id);
      setDialogOpen(false);
      setEditingEvent(null);
    } catch {
      toast.add({ type: 'error', title: '事件删除失败' });
    }
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
        <div className="grid shrink-0 grid-cols-7 border-b border-border bg-muted/60">
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
            return (
              <CalendarDayCell
                key={date.toISOString()}
                date={date}
                month={month}
                today={today}
                selectedDate={selectedDate}
                calendarDay={calendarDaysByDate.get(formatLocalDate(date))}
                onSelect={selectDate}
                onCreate={openCreateDialog}
                onEdit={openEditDialog}
              />
            );
          })}
        </div>
      </main>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingEvent ? '修改事件' : '添加事件'}</DialogTitle>
          </DialogHeader>
          <form
            className="flex flex-col gap-4"
            onSubmit={(event) => {
              event.preventDefault();
              void saveEvent();
            }}
          >
            <Input
              autoFocus
              aria-label="事项名称"
              value={eventTitle}
              onChange={(event) => setEventTitle(event.target.value)}
              placeholder="输入事项名称"
            />
            <div className="flex flex-col gap-2 text-sm font-medium">
              <span>事件类型</span>
              <Popover open={eventTypeOpen} onOpenChange={setEventTypeOpen}>
                <PopoverTrigger
                  render={
                    <Button
                      type="button"
                      variant="outline"
                      role="combobox"
                      aria-label="事件类型"
                      aria-expanded={eventTypeOpen}
                      className="w-full justify-between font-normal"
                    >
                      {EVENT_TYPE_OPTIONS.find((option) => option.value === eventType)?.label}
                      <ChevronDown data-icon="inline-end" className="text-muted-foreground" />
                    </Button>
                  }
                />
                <PopoverContent role="listbox" aria-label="事件类型" className="p-1">
                  {EVENT_TYPE_OPTIONS.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      role="option"
                      aria-selected={eventType === option.value}
                      onClick={() => {
                        setEventType(option.value);
                        setEventTypeOpen(false);
                      }}
                      className="flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-sm font-normal transition-colors hover:bg-accent focus-visible:bg-accent focus-visible:outline-none"
                    >
                      {option.label}
                      {eventType === option.value && <Check className="size-4 text-primary" />}
                    </button>
                  ))}
                </PopoverContent>
              </Popover>
            </div>
            <DialogFooter>
              {editingEvent && (
                <Button type="button" variant="destructive" onClick={() => void removeEvent()}>
                  删除
                </Button>
              )}
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                取消
              </Button>
              <Button
                type="submit"
                disabled={!eventTitle.trim() || createEvent.isPending || updateEvent.isPending}
              >
                {editingEvent ? '保存' : '添加'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
