import { useState, useEffect } from 'react';
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
import type { Bookmark } from '../types';
import { BkQueryApiKey, updateBookmarkApi } from './bookmarks.api';
import { useMutation, useQueryClient } from '@tanstack/react-query';

interface Props {
  editTarget: Bookmark | null;
  setEditTarget: (bookmark: Bookmark | null) => void;
}

export default function EditBookmarkDialog({ editTarget, setEditTarget }: Props) {
  const queryClient = useQueryClient();

  const [title, setTitle] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [description, setDescription] = useState('');

  useEffect(() => {
    if (editTarget) {
      setTitle(editTarget.title || '');
      setTags(editTarget.tags);
      setDescription(editTarget.description || '');
    }
  }, [editTarget]);

  const { mutate: handleUpdate, isPending: isUpdating, error: updateError } = useMutation({
    mutationFn: updateBookmarkApi,
    onSuccess: () => {
      setEditTarget(null);
      queryClient.invalidateQueries({ queryKey: [BkQueryApiKey.ALL_BOOKMARKS, BkQueryApiKey.TAGS] });
    },
  });

  function handleSubmit() {
    if (!editTarget || isUpdating) return;

    handleUpdate({
      id: editTarget.id,
      title: title.trim(),
      tags: tags,
      description: description.trim() || undefined,
    });
  }

  return (
    <Dialog
      open={editTarget !== null}
      onOpenChange={(open) => {
        if (!open) setEditTarget(null);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>编辑书签</DialogTitle>
          <DialogDescription>修改标题、标签或描述。</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="edit-title">标题</Label>
            <Input
              id="edit-title"
              placeholder="书签标题"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              autoFocus
            />
          </div>
          <div className="space-y-2">
            <Label>标签（可选）</Label>
            <TagInput value={tags} onChange={setTags} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="edit-description">描述（可选）</Label>
            <Textarea
              id="edit-description"
              placeholder="添加备注或描述"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          {updateError && (
            <div className="text-destructive">
              更新失败：{updateError.message}
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setEditTarget(null)} disabled={isUpdating}>
            取消
          </Button>
          <Button onClick={handleSubmit} disabled={isUpdating}>
            {isUpdating ? '保存中...' : '保存'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
