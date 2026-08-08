import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import type { CreateTodo, Todo, TodoTag } from '@/types';
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
import { tagColor } from '@/lib/tagColor';

interface TodoDialogProps {
  open: boolean;
  todo: Todo | null;
  availableTags: TodoTag[];
  onOpenChange: (open: boolean) => void;
  onSave: (input: CreateTodo) => Promise<void>;
}

export default function TodoDialog({
  open,
  todo,
  availableTags,
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
    setTags(todo?.tags ?? []);
    setHigh(todo?.is_high_priority ?? false);
    setTagInput('');
  }, [open, todo]);

  const addTag = (value: string) => {
    const next = value.trim();
    if (!next || tags.some((tag) => tag.toLowerCase() === next.toLowerCase())) return;
    setTags([...tags, next]);
    setTagInput('');
  };

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
            <div className="flex min-h-10 flex-wrap items-center gap-1.5 rounded-xl border border-border px-2 py-1.5 focus-within:ring-2 focus-within:ring-primary/30">
              {tags.map((tag) => (
                <span
                  key={tag}
                  className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs"
                  style={tagColor(tag)}
                >
                  {tag}
                  <button
                    type="button"
                    aria-label={`移除标签 ${tag}`}
                    onClick={() => setTags(tags.filter((item) => item !== tag))}
                  >
                    <X className="size-3" />
                  </button>
                </span>
              ))}
              <input
                id="todo-tags"
                value={tagInput}
                list="todo-tag-options"
                onChange={(event) => setTagInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ',' || event.key === '，') {
                    event.preventDefault();
                    addTag(tagInput);
                  }
                }}
                onBlur={() => addTag(tagInput)}
                placeholder={tags.length ? '' : '输入标签，回车添加'}
                className="min-w-28 flex-1 bg-transparent text-sm outline-none"
              />
              <datalist id="todo-tag-options">
                {availableTags.map((tag) => (
                  <option key={tag.id} value={tag.name} />
                ))}
              </datalist>
            </div>
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
