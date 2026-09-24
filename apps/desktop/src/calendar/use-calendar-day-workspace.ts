import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  addDays,
  addMonths,
  eachDayOfInterval,
  isSameMonth,
  startOfMonth,
  startOfWeek,
} from 'date-fns';

import { toast } from '@/components/ui/toast';
import {
  invokeCreateCalendarEvent,
  invokeDeleteCalendarEvent,
  invokeGetCalendarDays,
  invokeUpdateCalendarEvent,
} from '@/lib/invoke';
import { formatLocalDate } from '@/lib/date';
import { useCurrentDate } from '@/lib/use-current-date';
import { CalendarEventType, type CalendarDay, type CalendarEventSummary } from './calendar.types';

const CALENDAR_DAYS_QUERY_KEY = ['calendar-days'] as const;

export type CalendarDaysStatus = 'loading' | 'error' | 'empty' | 'ready';

export interface CalendarEventEditor {
  open: boolean;
  title: string;
  eventType: CalendarEventType;
  editingEvent: CalendarEventSummary | null;
  saving: boolean;
  setOpen: (open: boolean) => void;
  setTitle: (title: string) => void;
  setEventType: (eventType: CalendarEventType) => void;
  save: () => Promise<void>;
  remove: () => Promise<void>;
}

export interface CalendarDayWorkspace {
  today: Date;
  navigation: {
    month: Date;
    selectedDate: Date;
    changeMonth: (offset: number) => void;
    setMonth: (month: Date) => void;
    selectDate: (date: Date) => void;
  };
  days: {
    visibleDates: Date[];
    status: CalendarDaysStatus;
    find: (date: Date) => CalendarDay | undefined;
  };
  eventEditor: CalendarEventEditor;
  openCreate: (date?: Date) => void;
  openEdit: (event: CalendarEventSummary, date: Date) => void;
}

function visibleDatesForMonth(month: Date) {
  const start = startOfWeek(startOfMonth(month), { weekStartsOn: 1 });
  return eachDayOfInterval({ start, end: addDays(start, 41) });
}

export function useCalendarDayWorkspace(): CalendarDayWorkspace {
  const today = useCurrentDate();
  const [month, setMonthState] = useState(() => startOfMonth(today));
  const [selectedDate, setSelectedDate] = useState(today);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [eventTitle, setEventTitle] = useState('');
  const [eventType, setEventType] = useState(CalendarEventType.Other);
  const [editingEvent, setEditingEvent] = useState<CalendarEventSummary | null>(null);

  const visibleDates = useMemo(() => visibleDatesForMonth(month), [month]);
  const range = useMemo(
    () => ({
      start_date: formatLocalDate(visibleDates[0]),
      end_date: formatLocalDate(visibleDates[visibleDates.length - 1]),
    }),
    [visibleDates],
  );
  const calendarDays = useQuery({
    queryKey: [...CALENDAR_DAYS_QUERY_KEY, range.start_date, range.end_date],
    queryFn: () => invokeGetCalendarDays(range),
  });
  const calendarDaysByDate = useMemo(
    () => new Map((calendarDays.data ?? []).map((day) => [day.date, day])),
    [calendarDays.data],
  );

  const queryClient = useQueryClient();
  const refreshCalendarDays = () =>
    queryClient.invalidateQueries({ queryKey: CALENDAR_DAYS_QUERY_KEY });
  const createEvent = useMutation({
    mutationFn: invokeCreateCalendarEvent,
    onSuccess: refreshCalendarDays,
  });
  const updateEvent = useMutation({
    mutationFn: ({
      id,
      title,
      date,
      nextEventType,
    }: {
      id: string;
      title: string;
      date: string;
      nextEventType: CalendarEventType;
    }) => invokeUpdateCalendarEvent(id, { title, date, event_type: nextEventType }),
    onSuccess: refreshCalendarDays,
  });
  const deleteEvent = useMutation({
    mutationFn: invokeDeleteCalendarEvent,
    onSuccess: refreshCalendarDays,
  });

  const selectDate = (date: Date) => {
    setSelectedDate(date);
    if (!isSameMonth(date, month)) setMonthState(startOfMonth(date));
  };
  const changeMonth = (offset: number) => {
    setMonthState((current) => addMonths(current, offset));
    setSelectedDate((current) => addMonths(current, offset));
  };
  const setMonth = (nextMonth: Date) => {
    setMonthState(nextMonth);
    setSelectedDate((current) =>
      isSameMonth(current, nextMonth) ? current : startOfMonth(nextMonth),
    );
  };
  const openCreate = (date = selectedDate) => {
    selectDate(date);
    setEditingEvent(null);
    setEventTitle('');
    setEventType(CalendarEventType.Other);
    setDialogOpen(true);
  };
  const openEdit = (event: CalendarEventSummary, date: Date) => {
    selectDate(date);
    setEditingEvent(event);
    setEventTitle(event.title);
    setEventType(event.event_type);
    setDialogOpen(true);
  };
  const save = async () => {
    const title = eventTitle.trim();
    if (!title) return;
    const date = formatLocalDate(selectedDate);
    try {
      if (editingEvent) {
        await updateEvent.mutateAsync({
          id: editingEvent.id,
          title,
          date,
          nextEventType: eventType,
        });
      } else {
        await createEvent.mutateAsync({ title, date, event_type: eventType });
      }
      setDialogOpen(false);
      setEventTitle('');
    } catch {
      toast.add({ type: 'error', title: editingEvent ? '事件修改失败' : '事件添加失败' });
    }
  };
  const remove = async () => {
    if (!editingEvent) return;
    try {
      await deleteEvent.mutateAsync(editingEvent.id);
      setDialogOpen(false);
      setEditingEvent(null);
    } catch {
      toast.add({ type: 'error', title: '事件删除失败' });
    }
  };

  const status: CalendarDaysStatus = calendarDays.isLoading
    ? 'loading'
    : calendarDays.isError
      ? 'error'
      : calendarDays.data?.length === 0
        ? 'empty'
        : 'ready';

  return {
    today,
    navigation: { month, selectedDate, changeMonth, setMonth, selectDate },
    days: {
      visibleDates,
      status,
      find: (date) => calendarDaysByDate.get(formatLocalDate(date)),
    },
    eventEditor: {
      open: dialogOpen,
      title: eventTitle,
      eventType,
      editingEvent,
      saving: createEvent.isPending || updateEvent.isPending || deleteEvent.isPending,
      setOpen: setDialogOpen,
      setTitle: setEventTitle,
      setEventType,
      save,
      remove,
    },
    openCreate,
    openEdit,
  };
}
