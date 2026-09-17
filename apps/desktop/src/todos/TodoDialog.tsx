import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import type { CreateTodo, Todo, TodoTag } from '@/types';
import TagInput from '@/components/TagInput';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { DatePicker } from '@/components/ui/date-picker';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Field, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Textarea } from '@/components/ui/textarea';
import { formatLocalDate, parseLocalDate } from '@/lib/date';

interface TodoDialogProps {
  open: boolean;
  todo: Todo | null;
  availableTags: TodoTag[];
  defaultTag?: string;
  onOpenChange: (open: boolean) => void;
  onSave: (input: CreateTodo) => Promise<void>;
}

export default function TodoDialog({
  open,
  todo,
  availableTags,
  defaultTag,
  onOpenChange,
  onSave,
}: TodoDialogProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');
  const [high, setHigh] = useState(false);
  const [startDate, setStartDate] = useState<Date>();
  const [dueDate, setDueDate] = useState<Date>();
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setTitle(todo?.title ?? '');
    setDescription(todo?.description ?? '');
    setTags(todo?.tags ?? (defaultTag ? [defaultTag] : []));
    setHigh(todo?.is_high_priority ?? false);
    setStartDate(parseLocalDate(todo?.start_date));
    setDueDate(parseLocalDate(todo?.due_date));
    setTagInput('');
  }, [open, todo, defaultTag]);

  const startDateValue = startDate ? formatLocalDate(startDate) : null;
  const dueDateValue = dueDate ? formatLocalDate(dueDate) : null;
  const dateError =
    startDateValue && dueDateValue && startDateValue > dueDateValue
      ? '开始日期不能晚于截止日期'
      : null;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!title.trim() || dateError || saving) return;
    const pendingTag = tagInput.trim();
    const submittedTags =
      pendingTag && !tags.some((tag) => tag.toLowerCase() === pendingTag.toLowerCase())
        ? [...tags, pendingTag]
        : tags;
    setSaving(true);
    try {
      await onSave({
        title,
        description,
        tags: submittedTags,
        is_high_priority: high,
        start_date: startDateValue,
        due_date: dueDateValue,
      });
      onOpenChange(false);
    } catch {
      // The parent mutation reports the error and the dialog remains open.
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={submit} className="flex flex-col gap-5">
          <DialogHeader>
            <DialogTitle>{todo ? '编辑任务' : '新建任务'}</DialogTitle>
          </DialogHeader>
          <FieldGroup>
            <Field data-invalid={!title.trim() || undefined}>
              <FieldLabel htmlFor="todo-title">标题</FieldLabel>
              <Input
                id="todo-title"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                aria-invalid={!title.trim()}
                autoFocus
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="todo-description">描述</FieldLabel>
              <Textarea
                id="todo-description"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                rows={4}
              />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field data-invalid={dateError ? true : undefined}>
                <FieldLabel htmlFor="todo-start-date">开始日期</FieldLabel>
                <div className="flex items-center gap-2">
                  <DatePicker
                    id="todo-start-date"
                    aria-label="开始日期"
                    aria-invalid={Boolean(dateError)}
                    value={startDate}
                    onValueChange={setStartDate}
                    disabledDates={dueDate ? { after: dueDate } : undefined}
                    placeholder="选择开始日期"
                    className="w-full"
                  />
                  {startDate && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      aria-label="清空开始日期"
                      onClick={() => setStartDate(undefined)}
                    >
                      <X />
                    </Button>
                  )}
                </div>
              </Field>
              <Field data-invalid={dateError ? true : undefined}>
                <FieldLabel htmlFor="todo-due-date">截止日期</FieldLabel>
                <div className="flex items-center gap-2">
                  <DatePicker
                    id="todo-due-date"
                    aria-label="截止日期"
                    aria-invalid={Boolean(dateError)}
                    value={dueDate}
                    onValueChange={setDueDate}
                    disabledDates={startDate ? { before: startDate } : undefined}
                    placeholder="选择截止日期"
                    className="w-full"
                  />
                  {dueDate && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      aria-label="清空截止日期"
                      onClick={() => setDueDate(undefined)}
                    >
                      <X />
                    </Button>
                  )}
                </div>
              </Field>
            </div>
            {dateError && <FieldError role="alert">{dateError}</FieldError>}
            <Field>
              <FieldLabel htmlFor="todo-tags">标签</FieldLabel>
              <TagInput
                inputId="todo-tags"
                value={tags}
                onChange={setTags}
                onPendingChange={setTagInput}
                suggestions={availableTags.map((tag) => tag.name)}
              />
            </Field>
            <Field className="flex-row items-center">
              <Checkbox id="todo-high-priority" checked={high} onCheckedChange={setHigh} />
              <FieldLabel htmlFor="todo-high-priority">高优先级</FieldLabel>
            </Field>
          </FieldGroup>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              取消
            </Button>
            <Button type="submit" disabled={!title.trim() || Boolean(dateError) || saving}>
              {saving ? '保存中…' : '保存'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
