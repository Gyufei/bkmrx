import { useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';

import { CalendarEventType } from './calendar.types';
import type { CalendarEventEditor } from './use-calendar-day-workspace';
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
  editor: CalendarEventEditor;
}

export default function CalendarEventDialog({ editor }: CalendarEventDialogProps) {
  const [eventTypeOpen, setEventTypeOpen] = useState(false);

  return (
    <Dialog open={editor.open} onOpenChange={editor.setOpen}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{editor.editingEvent ? '修改事件' : '添加事件'}</DialogTitle>
        </DialogHeader>
        <form
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            void editor.save();
          }}
        >
          <Input
            autoFocus
            aria-label="事项名称"
            value={editor.title}
            onChange={(event) => editor.setTitle(event.target.value)}
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
                    {EVENT_TYPE_OPTIONS.find((option) => option.value === editor.eventType)?.label}
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
                    aria-selected={editor.eventType === option.value}
                    onClick={() => {
                      editor.setEventType(option.value);
                      setEventTypeOpen(false);
                    }}
                    className="flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-sm font-normal transition-colors hover:bg-accent focus-visible:bg-accent focus-visible:outline-none"
                  >
                    {option.label}
                    {editor.eventType === option.value && <Check className="size-4 text-primary" />}
                  </button>
                ))}
              </PopoverContent>
            </Popover>
          </div>
          <DialogFooter>
            {editor.editingEvent && (
              <Button type="button" variant="destructive" onClick={() => void editor.remove()}>
                删除
              </Button>
            )}
            <Button type="button" variant="outline" onClick={() => editor.setOpen(false)}>
              取消
            </Button>
            <Button type="submit" disabled={!editor.title.trim() || editor.saving}>
              {editor.editingEvent ? '保存' : '添加'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
