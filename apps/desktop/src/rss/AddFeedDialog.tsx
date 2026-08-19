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
import type { FeedCandidate } from '@/types';
import { createFeedApi, previewFeedApi, RSS_ENTRIES_KEY, RSS_FEEDS_KEY } from './rss.api';

export default function AddFeedDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const client = useQueryClient();
  const [url, setUrl] = useState('');
  const [sourceUrl, setSourceUrl] = useState('');
  const [candidates, setCandidates] = useState<FeedCandidate[]>([]);
  const create = useMutation({
    mutationFn: ({ source, feed }: { source: string; feed: string }) =>
      createFeedApi({ source_url: source, feed_url: feed }),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: RSS_FEEDS_KEY });
      void client.invalidateQueries({ queryKey: RSS_ENTRIES_KEY });
      onOpenChange(false);
    },
  });
  const preview = useMutation({
    mutationFn: previewFeedApi,
    onSuccess: (data) => {
      setSourceUrl(data.source_url);
      setCandidates(data.candidates);
      if (data.candidates.length === 1) {
        create.mutate({ source: data.source_url, feed: data.candidates[0].feed_url });
      }
    },
  });
  useEffect(() => {
    if (!open) {
      setUrl('');
      setCandidates([]);
      preview.reset();
      create.reset();
    }
  }, [open]);
  const error = preview.error ?? create.error;

  return (
    <Dialog
      open={open}
      onOpenChange={(value) => !preview.isPending && !create.isPending && onOpenChange(value)}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>添加 RSS 订阅</DialogTitle>
          <DialogDescription>输入 Feed 地址，或包含 RSS/Atom 声明的网页地址。</DialogDescription>
        </DialogHeader>
        <form
          className="space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            preview.mutate(url.trim());
          }}
        >
          <Input
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            placeholder="https://example.com/feed.xml"
            autoFocus
          />
          {candidates.length > 0 && (
            <div className="space-y-2 rounded-md border p-2">
              {candidates.map((candidate) => (
                <button
                  key={candidate.feed_url}
                  type="button"
                  disabled={create.isPending}
                  onClick={() => create.mutate({ source: sourceUrl, feed: candidate.feed_url })}
                  className="block w-full rounded-md px-3 py-2 text-left hover:bg-accent"
                >
                  <div className="text-sm font-medium">{candidate.title || 'RSS Feed'}</div>
                  <div className="truncate text-xs text-muted-foreground">{candidate.feed_url}</div>
                </button>
              ))}
            </div>
          )}
          {error && <p className="text-sm text-destructive">{error.message}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              取消
            </Button>
            <Button type="submit" disabled={!url.trim() || preview.isPending}>
              {preview.isPending ? '检测中…' : '检测订阅'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
