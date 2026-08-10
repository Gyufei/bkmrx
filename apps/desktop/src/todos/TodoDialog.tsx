import { useEffect, useState } from 'react';
import type { CreateTodo, Todo, TodoTag } from '@/types';
import TagInput from '@/components/TagInput';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

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
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setTitle(todo?.title ?? '');
    setDescription(todo?.description ?? '');
    setTags(todo?.tags ?? (defaultTag ? [defaultTag] : []));
    setHigh(todo?.is_high_priority ?? false);
    setTagInput('');
  }, [open, todo, defaultTag]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!title.trim() || saving) return;
    const pendingTag = tagInput.trim();
    const submittedTags =
      pendingTag && !tags.some((tag) => tag.toLowerCase() === pendingTag.toLowerCase())
        ? [...tags, pendingTag]
        : tags;
    setSaving(true);
    try {
      await onSave({ title, description, tags: submittedTags, is_high_priority: high });
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
        <form onSubmit={submit} className="grid gap-5">
          <DialogHeader>
            <DialogTitle>{todo ? '编辑任务' : '新建任务'}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-2">
            <Label htmlFor="todo-title">标题</Label>
            <Input
              id="todo-title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              autoFocus
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="todo-description">描述</Label>
            <Textarea
              id="todo-description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              rows={4}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="todo-tags">标签</Label>
            <TagInput
              inputId="todo-tags"
              value={tags}
              onChange={setTags}
              onPendingChange={setTagInput}
              suggestions={availableTags.map((tag) => tag.name)}
            />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={high}
              onChange={(event) => setHigh(event.target.checked)}
              className="accent-primary"
            />
            高优先级
          </label>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              取消
            </Button>
            <Button type="submit" disabled={!title.trim() || saving}>
              {saving ? '保存中…' : '保存'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
