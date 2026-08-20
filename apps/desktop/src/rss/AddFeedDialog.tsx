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
import { Spinner } from '@/components/ui/spinner';
import { cn } from '@/lib/utils';
import type { AppError, FeedCandidate } from '@/types';
import { createFeedApi, previewFeedApi, RSS_ENTRIES_KEY, RSS_FEEDS_KEY } from './rss.api';

export default function AddFeedDialog({
  open,
  onOpenChange,
  onExistingFeed,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onExistingFeed: (id: number) => void;
}) {
  const client = useQueryClient();
  const [url, setUrl] = useState('');
  const [sourceUrl, setSourceUrl] = useState('');
  const [candidates, setCandidates] = useState<FeedCandidate[]>([]);
  const [selected, setSelected] = useState<FeedCandidate | null>(null);
  const [customTitle, setCustomTitle] = useState('');
  const inspect = useMutation({
    mutationFn: previewFeedApi,
    onSuccess: (data) => {
      const detail = data.candidates[0] ?? null;
      setSelected(detail);
      setCustomTitle(detail?.title ?? '');
    },
  });
  const chooseCandidate = (candidate: FeedCandidate) => {
    setSelected(null);
    setCustomTitle(candidate.title ?? '');
    inspect.mutate(candidate.feed_url);
  };
  const preview = useMutation({
    mutationFn: previewFeedApi,
    onSuccess: (data) => {
      setSourceUrl(data.source_url);
      setCandidates(data.candidates);
      const first = data.candidates[0];
      if (!first) return;
      if (first.site_url !== null || first.recent_entries.length > 0) {
        setSelected(first);
        setCustomTitle(first.title ?? '');
      } else chooseCandidate(first);
    },
  });
  const create = useMutation({
    mutationFn: () =>
      createFeedApi({
        source_url: sourceUrl,
        feed_url: selected!.feed_url,
        custom_title: customTitle.trim() || null,
      }),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: RSS_FEEDS_KEY });
      void client.invalidateQueries({ queryKey: RSS_ENTRIES_KEY });
      onOpenChange(false);
    },
    onError: (error) => {
      const appError = error as unknown as AppError;
      const id = (appError.details as { id?: number } | null)?.id;
      if (appError.code === 'rss_feed_conflict' && id !== undefined) {
        onExistingFeed(id);
        onOpenChange(false);
      }
    },
  });
  useEffect(() => {
    if (!open) {
      setUrl('');
      setSourceUrl('');
      setCandidates([]);
      setSelected(null);
      setCustomTitle('');
      preview.reset();
      inspect.reset();
      create.reset();
    }
  }, [open]);
  const pending = preview.isPending || inspect.isPending || create.isPending;
  const error = preview.error ?? inspect.error ?? create.error;

  return (
    <Dialog open={open} onOpenChange={(value) => !pending && onOpenChange(value)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>添加 RSS 订阅</DialogTitle>
          <DialogDescription>输入 Feed 地址，或包含 RSS/Atom 声明的网页地址。</DialogDescription>
        </DialogHeader>
        <form
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (selected) create.mutate();
            else preview.mutate(url.trim());
          }}
        >
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="rss-url">订阅地址</FieldLabel>
              <Input
                id="rss-url"
                value={url}
                onChange={(event) => setUrl(event.target.value)}
                placeholder="https://example.com/feed.xml"
                disabled={pending || candidates.length > 0}
                autoFocus
              />
            </Field>
            {candidates.length > 1 && (
              <Field>
                <FieldLabel>选择订阅源</FieldLabel>
                <div className="flex flex-col gap-1 rounded-md border p-1">
                  {candidates.map((candidate) => (
                    <button
                      key={candidate.feed_url}
                      type="button"
                      disabled={pending}
                      onClick={() => chooseCandidate(candidate)}
                      className={cn(
                        'rounded-md px-3 py-2 text-left hover:bg-accent',
                        selected?.feed_url === candidate.feed_url && 'bg-accent',
                      )}
                    >
                      <span className="block text-sm font-medium">
                        {candidate.title || 'RSS Feed'}
                      </span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {candidate.feed_url}
                      </span>
                    </button>
                  ))}
                </div>
              </Field>
            )}
            {inspect.isPending && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Spinner />
                正在加载订阅预览…
              </div>
            )}
            {selected && (
              <div className="flex flex-col gap-3 rounded-md border p-3">
                <div>
                  <p className="font-medium">{selected.title || '未命名订阅'}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {selected.site_url || selected.feed_url}
                  </p>
                </div>
                {selected.recent_entries.length > 0 && (
                  <div className="flex flex-col gap-1">
                    <p className="text-xs font-medium text-muted-foreground">最近文章</p>
                    {selected.recent_entries.map((entry, index) => (
                      <p key={`${entry.title}-${index}`} className="truncate text-sm">
                        {entry.title}
                      </p>
                    ))}
                  </div>
                )}
                <Field>
                  <FieldLabel htmlFor="rss-title">显示名称</FieldLabel>
                  <Input
                    id="rss-title"
                    value={customTitle}
                    onChange={(event) => setCustomTitle(event.target.value)}
                    disabled={create.isPending}
                  />
                </Field>
              </div>
            )}
            {error && <FieldError>{error.message}</FieldError>}
          </FieldGroup>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              取消
            </Button>
            <Button type="submit" disabled={selected ? create.isPending : !url.trim() || pending}>
              {create.isPending ? '订阅中…' : selected ? '确认订阅' : '检测订阅'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
