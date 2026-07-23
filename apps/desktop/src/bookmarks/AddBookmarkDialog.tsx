import { useState, useCallback } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import TagInput from '@/components/TagInput';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { addBookmarkApi, BkQueryApiKey } from './bookmarks.api';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function AddBookmarkDialog({ open, onOpenChange }: Props) {
  const queryClient = useQueryClient();

  const { mutate: handleAdd, isPending: isAdding, error: addError } = useMutation({
    mutationFn: addBookmarkApi,
    onSuccess: () => {
      onOpenChange(false);
      queryClient.invalidateQueries({ queryKey: [BkQueryApiKey.ALL_BOOKMARKS, BkQueryApiKey.TAGS] });
    },
  });

  const [url, setUrl] = useState('');
  const [title, setTitle] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [description, setDescription] = useState('');

  const handleSubmit = useCallback(async () => {
    if (!url.trim()) return;

    handleAdd({
      url: url.trim(),
      title: title.trim(),
      tags,
      description: description.trim() || undefined
    });
  }, [url, title, tags, description, handleAdd]);

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!isAdding) onOpenChange(v);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>添加书签</DialogTitle>
          <DialogDescription>输入书签信息，添加后自动同步到 bkmr 数据库。</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="url">URL</Label>
            <Input
              id="url"
              placeholder="https://example.com"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              autoFocus
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="title">标题（可选）</Label>
            <Input
              id="title"
              placeholder="书签标题"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label>标签（可选）</Label>
            <TagInput value={tags} onChange={setTags} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="description">描述（可选）</Label>
            <Textarea
              id="description"
              placeholder="添加备注或描述"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
        </div>
        {addError && (
          <div className="text-destructive">
            添加失败：{addError.message}
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isAdding}>
            取消
          </Button>
          <Button onClick={handleSubmit} disabled={!url.trim() || isAdding}>
            {isAdding ? '添加中...' : '添加'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
