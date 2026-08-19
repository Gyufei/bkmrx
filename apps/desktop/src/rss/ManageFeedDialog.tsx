import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import type { RssFeed } from '@/types';
import { deleteFeedApi, renameFeedApi, RSS_ENTRIES_KEY, RSS_FEEDS_KEY } from './rss.api';

export default function ManageFeedDialog({
  feed,
  onClose,
  onDeleted,
}: {
  feed: RssFeed | null;
  onClose: () => void;
  onDeleted: (id: number) => void;
}) {
  const client = useQueryClient();
  const [title, setTitle] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  useEffect(() => {
    setTitle(feed?.custom_title || feed?.title || '');
    setConfirmDelete(false);
  }, [feed]);
  const invalidate = () => {
    void client.invalidateQueries({ queryKey: RSS_FEEDS_KEY });
    void client.invalidateQueries({ queryKey: RSS_ENTRIES_KEY });
  };
  const rename = useMutation({
    mutationFn: () => renameFeedApi(feed!.id, title.trim() || null),
    onSuccess: () => {
      invalidate();
      onClose();
    },
  });
  const remove = useMutation({
    mutationFn: () => deleteFeedApi(feed!.id),
    onSuccess: () => {
      invalidate();
      onDeleted(feed!.id);
      onClose();
    },
  });
  const error = rename.error ?? remove.error;
  return (
    <Dialog open={!!feed} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{confirmDelete ? '删除订阅' : '管理订阅'}</DialogTitle>
          <DialogDescription>
            {confirmDelete
              ? `将删除“${feed?.custom_title || feed?.title}”及本地保存的全部文章。`
              : feed?.feed_url}
          </DialogDescription>
        </DialogHeader>
        {confirmDelete ? (
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => setConfirmDelete(false)}
              disabled={remove.isPending}
            >
              取消
            </Button>
            <Button
              variant="destructive"
              onClick={() => remove.mutate()}
              disabled={remove.isPending}
            >
              {remove.isPending ? '删除中…' : '确认删除'}
            </Button>
          </div>
        ) : (
          <form
            className="space-y-3"
            onSubmit={(event) => {
              event.preventDefault();
              rename.mutate();
            }}
          >
            <Input value={title} onChange={(event) => setTitle(event.target.value)} />
            {error && <p className="text-sm text-destructive">{error.message}</p>}
            <div className="flex justify-between">
              <Button type="button" variant="destructive" onClick={() => setConfirmDelete(true)}>
                删除订阅
              </Button>
              <div className="flex gap-2">
                <Button type="button" variant="outline" onClick={onClose}>
                  取消
                </Button>
                <Button type="submit" disabled={rename.isPending}>
                  {rename.isPending ? '保存中…' : '保存'}
                </Button>
              </div>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
