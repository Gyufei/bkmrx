import { format } from 'date-fns';
import { zhCN } from 'date-fns/locale';
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react';

import CalendarEventDialog from '@/calendar/CalendarEventDialog';
import { useCalendarDayWorkspace } from '@/calendar/use-calendar-day-workspace';
import CollapsibleSidebar from '@/components/CollapsibleSidebar';
import PageShell from '@/components/PageShell';
import { PageError, PageLoading } from '@/components/PageStatus';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Empty, EmptyDescription, EmptyTitle } from '@/components/ui/empty';
import CalendarDayCell from './CalendarDayCell';

const WEEKDAYS = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];

export default function CalendarPage() {
  const workspace = useCalendarDayWorkspace();

  const sidebarTitle = (
    <div className="flex min-w-0 flex-1 items-center justify-center gap-1">
      <Button
        variant="ghost"
        size="icon-xs"
        aria-label="上个月"
        onClick={() => workspace.navigation.changeMonth(-1)}
      >
        <ChevronLeft />
      </Button>
      <span className="min-w-24 truncate text-center">
        {format(workspace.navigation.month, 'yyyy年 M月', { locale: zhCN })}
      </span>
      <Button
        variant="ghost"
        size="icon-xs"
        aria-label="下个月"
        onClick={() => workspace.navigation.changeMonth(1)}
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
          today={workspace.today}
          month={workspace.navigation.month}
          selected={workspace.navigation.selectedDate}
          onMonthChange={workspace.navigation.setMonth}
          onSelect={(date) => date && workspace.navigation.selectDate(date)}
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
        <Button className="mt-4 w-full" onClick={() => workspace.openCreate()}>
          <Plus data-icon="inline-start" />
          添加事项
        </Button>
      </CollapsibleSidebar>

      <PageShell>
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
        {workspace.days.status === 'loading' ? (
          <PageLoading text="正在加载日历…" className="flex-1" />
        ) : workspace.days.status === 'error' ? (
          <PageError title="日历加载失败" className="flex-1" />
        ) : workspace.days.status === 'empty' ? (
          <Empty className="flex-1 p-5">
            <EmptyTitle>暂无日历数据</EmptyTitle>
            <EmptyDescription>当前月份没有可展示的日期信息。</EmptyDescription>
          </Empty>
        ) : (
          <div className="grid min-h-0 flex-1 grid-cols-7 grid-rows-6 overflow-hidden">
            {workspace.days.visibleDates.map((date) => (
              <CalendarDayCell
                key={date.toISOString()}
                date={date}
                month={workspace.navigation.month}
                today={workspace.today}
                selectedDate={workspace.navigation.selectedDate}
                calendarDay={workspace.days.find(date)}
                onSelect={workspace.navigation.selectDate}
                onCreate={workspace.openCreate}
                onEdit={workspace.openEdit}
              />
            ))}
          </div>
        )}
      </PageShell>

      <CalendarEventDialog editor={workspace.eventEditor} />
    </div>
  );
}
