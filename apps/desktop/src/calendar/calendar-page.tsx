import { useMemo } from 'react';
import { addDays, eachDayOfInterval, format, startOfMonth, startOfWeek } from 'date-fns';
import { zhCN } from 'date-fns/locale';
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react';

import CalendarEventDialog from '@/calendar/calendar-event-dialog';
import { useCalendarDays } from '@/calendar/use-calendar-days';
import { useCalendarEventEditor } from '@/calendar/use-calendar-event-editor';
import CollapsibleSidebar from '@/components/CollapsibleSidebar';
import { Alert, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Empty, EmptyDescription, EmptyTitle } from '@/components/ui/empty';
import { Spinner } from '@/components/ui/spinner';
import { formatLocalDate } from '@/lib/date';
import CalendarDayCell from './calendar-day-cell';

const WEEKDAYS = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];

function getMonthDays(month: Date) {
  const start = startOfWeek(startOfMonth(month), { weekStartsOn: 1 });
  return eachDayOfInterval({ start, end: addDays(start, 41) });
}

export default function CalendarPage() {
  const editor = useCalendarEventEditor();
  const monthDays = useMemo(() => getMonthDays(editor.month), [editor.month]);
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
  const today = useMemo(() => new Date(), []);

  const sidebarTitle = (
    <div className="flex min-w-0 flex-1 items-center justify-center gap-1">
      <Button
        variant="ghost"
        size="icon-xs"
        aria-label="上个月"
        onClick={() => editor.changeMonth(-1)}
      >
        <ChevronLeft />
      </Button>
      <span className="min-w-24 truncate text-center">
        {format(editor.month, 'yyyy年 M月', { locale: zhCN })}
      </span>
      <Button
        variant="ghost"
        size="icon-xs"
        aria-label="下个月"
        onClick={() => editor.changeMonth(1)}
      >
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
          month={editor.month}
          selected={editor.selectedDate}
          onMonthChange={editor.setMonth}
          onSelect={(date) => date && editor.selectDate(date)}
          locale={zhCN}
          weekStartsOn={1}
          showOutsideDays={false}
          className="w-full bg-transparent p-0 [--cell-size:--spacing(8)]"
          classNames={{
            nav: 'hidden',
            month_caption: 'hidden',
            today: 'rounded-(--cell-radius) text-primary',
            day_button: '!mx-auto !size-6 !min-w-0 rounded-5',
          }}
        />
        <Button className="mt-4 w-full" onClick={() => editor.openCreate()}>
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
        {calendarDays.isLoading ? (
          <div
            role="status"
            className="flex flex-1 items-center justify-center gap-2 text-muted-foreground"
          >
            <Spinner />
            <span>正在加载日历…</span>
          </div>
        ) : calendarDays.isError ? (
          <div className="flex flex-1 items-center justify-center p-5">
            <Alert variant="destructive" className="max-w-md text-center">
              <AlertTitle>日历加载失败</AlertTitle>
            </Alert>
          </div>
        ) : calendarDays.data?.length === 0 ? (
          <Empty className="flex-1 p-5">
            <EmptyTitle>暂无日历数据</EmptyTitle>
            <EmptyDescription>当前月份没有可展示的日期信息。</EmptyDescription>
          </Empty>
        ) : (
          <div className="grid min-h-0 flex-1 grid-cols-7 grid-rows-6 overflow-hidden">
            {monthDays.map((date) => (
              <CalendarDayCell
                key={date.toISOString()}
                date={date}
                month={editor.month}
                today={today}
                selectedDate={editor.selectedDate}
                calendarDay={calendarDaysByDate.get(formatLocalDate(date))}
                onSelect={editor.selectDate}
                onCreate={editor.openCreate}
                onEdit={editor.openEdit}
              />
            ))}
          </div>
        )}
      </main>

      <CalendarEventDialog
        open={editor.dialogOpen}
        onOpenChange={editor.setDialogOpen}
        title={editor.eventTitle}
        onTitleChange={editor.setEventTitle}
        eventType={editor.eventType}
        onEventTypeChange={editor.setEventType}
        editingEvent={editor.editingEvent}
        saving={editor.saving}
        onSave={editor.save}
        onRemove={editor.remove}
      />
    </div>
  );
}
