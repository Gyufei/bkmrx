import { useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { addMonths, isSameMonth, startOfMonth } from 'date-fns';

import {
  CALENDAR_DAYS_QUERY_KEY,
  createCalendarEventApi,
  deleteCalendarEventApi,
  updateCalendarEventApi,
} from './calendar.api';
import { CalendarEventType, type CalendarEventSummary } from './calendar.types';
import { formatLocalDate } from '@/lib/date';
import { toast } from '@/components/ui/toast';

export function useCalendarEventEditor() {
  const today = useMemo(() => new Date(), []);
  const [month, setMonth] = useState(() => startOfMonth(today));
  const [selectedDate, setSelectedDate] = useState(today);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [eventTitle, setEventTitle] = useState('');
  const [eventType, setEventType] = useState(CalendarEventType.Other);
  const [editingEvent, setEditingEvent] = useState<CalendarEventSummary | null>(null);

  const queryClient = useQueryClient();
  const refresh = () => queryClient.invalidateQueries({ queryKey: CALENDAR_DAYS_QUERY_KEY });

  const createEvent = useMutation({
    mutationFn: createCalendarEventApi,
    onSuccess: refresh,
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
    onSuccess: refresh,
  });
  const deleteEvent = useMutation({
    mutationFn: deleteCalendarEventApi,
    onSuccess: refresh,
  });

  const saving = createEvent.isPending || updateEvent.isPending;

  const selectDate = (date: Date) => {
    setSelectedDate(date);
    if (!isSameMonth(date, month)) setMonth(startOfMonth(date));
  };

  const changeMonth = (offset: number) => {
    setMonth((current) => addMonths(current, offset));
    setSelectedDate((current) => addMonths(current, offset));
  };

  const handleMonthChange = (nextMonth: Date) => {
    setMonth(nextMonth);
    setSelectedDate((current) => (isSameMonth(current, nextMonth) ? current : startOfMonth(nextMonth)));
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
      if (editingEvent)
        await updateEvent.mutateAsync({ id: editingEvent.id, title, date, eventType });
      else await createEvent.mutateAsync({ title, date, event_type: eventType });
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

  return {
    month,
    selectedDate,
    dialogOpen,
    eventTitle,
    setEventTitle,
    eventType,
    setEventType,
    editingEvent,
    saving,
    changeMonth,
    setMonth: handleMonthChange,
    selectDate,
    openCreate,
    openEdit,
    setDialogOpen,
    save,
    remove,
  };
}
