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
import { Field, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import type { RssFeed } from '@/types';
import { invalidateRssQueries, renameFeedApi } from './rss.api';

export default function RenameFeedDialog({
  feed,
  onClose,
}: {
  feed: RssFeed | null;
  onClose: () => void;
}) {
  const client = useQueryClient();
  const [title, setTitle] = useState('');
  useEffect(() => setTitle(feed?.custom_title || feed?.title || ''), [feed]);
  const rename = useMutation({
    mutationFn: () => renameFeedApi(feed!.id, title.trim() || null),
    onSuccess: () => {
      void invalidateRssQueries(client);
      onClose();
    },
  });
  return (
    <Dialog open={!!feed} onOpenChange={(open) => !open && !rename.isPending && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>编辑订阅名称</DialogTitle>
          <DialogDescription>{feed?.feed_url}</DialogDescription>
        </DialogHeader>
        <form
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            rename.mutate();
          }}
        >
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="rss-rename">显示名称</FieldLabel>
              <Input
                id="rss-rename"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                disabled={rename.isPending}
                autoFocus
              />
            </Field>
            {rename.error && <FieldError>{rename.error.message}</FieldError>}
          </FieldGroup>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={rename.isPending}>
              取消
            </Button>
            <Button type="submit" disabled={rename.isPending}>
              {rename.isPending ? '保存中…' : '保存'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
