import { useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';

import { CalendarEventType, type CalendarEventSummary } from './calendar.types';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

const EVENT_TYPE_OPTIONS = [
  { value: CalendarEventType.Work, label: '工作' },
  { value: CalendarEventType.Personal, label: '个人' },
  { value: CalendarEventType.Anniversary, label: '纪念日' },
  { value: CalendarEventType.Other, label: '其他' },
] as const;

interface CalendarEventDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  onTitleChange: (title: string) => void;
  eventType: CalendarEventType;
  onEventTypeChange: (type: CalendarEventType) => void;
  editingEvent: CalendarEventSummary | null;
  saving: boolean;
  onSave: () => void;
  onRemove: () => void;
}

export default function CalendarEventDialog({
  open,
  onOpenChange,
  title,
  onTitleChange,
  eventType,
  onEventTypeChange,
  editingEvent,
  saving,
  onSave,
  onRemove,
}: CalendarEventDialogProps) {
  const [eventTypeOpen, setEventTypeOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{editingEvent ? '修改事件' : '添加事件'}</DialogTitle>
        </DialogHeader>
        <form
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            void onSave();
          }}
        >
          <Input
            autoFocus
            aria-label="事项名称"
            value={title}
            onChange={(event) => onTitleChange(event.target.value)}
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
                      onEventTypeChange(option.value);
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
              <Button type="button" variant="destructive" onClick={() => void onRemove()}>
                删除
              </Button>
            )}
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              取消
            </Button>
            <Button type="submit" disabled={!title.trim() || saving}>
              {editingEvent ? '保存' : '添加'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
