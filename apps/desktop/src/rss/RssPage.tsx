import { useEffect, useMemo, useState } from 'react';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { open } from '@tauri-apps/plugin-shell';
import { Circle, CircleCheck, Plus, RefreshCw, Rss, Settings2, TriangleAlert } from 'lucide-react';
import CollapsibleSidebar from '@/components/CollapsibleSidebar';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/toast';
import type { RssEntry, RssEntryScope, RssFeed } from '@/types';
import AddFeedDialog from './AddFeedDialog';
import ManageFeedDialog from './ManageFeedDialog';
import {
  listEntriesApi,
  listFeedsApi,
  markEntryReadApi,
  refreshAllFeedsApi,
  RSS_ENTRIES_KEY,
  RSS_FEEDS_KEY,
  rssEntriesKey,
} from './rss.api';

export default function RssPage() {
  const client = useQueryClient();
  const [scope, setScope] = useState<RssEntryScope>({ mode: 'all' });
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [managedFeed, setManagedFeed] = useState<RssFeed | null>(null);
  const feeds = useQuery({ queryKey: RSS_FEEDS_KEY, queryFn: listFeedsApi });
  const entries = useInfiniteQuery({
    queryKey: rssEntriesKey(scope),
    queryFn: ({ pageParam }) => listEntriesApi(scope, pageParam),
    initialPageParam: null as string | null,
    getNextPageParam: (page) => page.next_cursor,
  });
  const items = useMemo(
    () => entries.data?.pages.flatMap((page) => page.entries) ?? [],
    [entries.data],
  );
  const selected = items.find((entry) => entry.id === selectedId) ?? null;
  const total = feeds.data?.reduce((sum, feed) => sum + feed.entry_count, 0) ?? 0;
  const unread = feeds.data?.reduce((sum, feed) => sum + feed.unread_count, 0) ?? 0;
  const invalidate = () => {
    void client.invalidateQueries({ queryKey: RSS_FEEDS_KEY });
    void client.invalidateQueries({ queryKey: RSS_ENTRIES_KEY });
  };
  const markRead = useMutation({
    mutationFn: ({ id, isRead }: { id: number; isRead: boolean }) => markEntryReadApi(id, isRead),
    onSuccess: invalidate,
  });
  const refresh = useMutation({
    mutationFn: refreshAllFeedsApi,
    onSuccess: (result) => {
      invalidate();
      if (result.failed) toast.add({ type: 'warning', title: `${result.failed} 个订阅刷新失败` });
    },
  });
  useEffect(() => {
    refresh.mutate(true);
  }, []);
  useEffect(() => {
    if (selectedId !== null && !items.some((entry) => entry.id === selectedId)) setSelectedId(null);
  }, [items, selectedId]);
  const choose = (entry: RssEntry) => {
    setSelectedId(entry.id);
    if (!entry.is_read) markRead.mutate({ id: entry.id, isRead: true });
  };

  return (
    <div className="flex min-h-0 flex-1">
      <CollapsibleSidebar title="RSS" className="w-60" contentClassName="flex flex-col">
        <div className="space-y-1 p-2">
          <SidebarItem
            active={scope.mode === 'all'}
            label="全部文章"
            count={total}
            onClick={() => setScope({ mode: 'all' })}
          />
          <SidebarItem
            active={scope.mode === 'unread'}
            label="未读"
            count={unread}
            onClick={() => setScope({ mode: 'unread' })}
          />
        </div>
        <div className="flex items-center justify-between px-3 py-2 text-xs font-medium text-muted-foreground">
          <span>订阅源</span>
          <Button variant="ghost" size="icon-sm" onClick={() => setAddOpen(true)} title="添加订阅">
            <Plus />
          </Button>
        </div>
        <div className="min-h-0 flex-1 overflow-auto px-2 pb-2">
          {feeds.data?.map((feed) => (
            <FeedItem
              key={feed.id}
              feed={feed}
              active={scope.mode === 'feed' && scope.feed_id === feed.id}
              onClick={() => setScope({ mode: 'feed', feed_id: feed.id })}
              onManage={() => setManagedFeed(feed)}
            />
          ))}
        </div>
        <div className="border-t p-2">
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start"
            disabled={refresh.isPending}
            onClick={() => refresh.mutate(false)}
          >
            <RefreshCw className={refresh.isPending ? 'animate-spin' : ''} />
            刷新全部
          </Button>
        </div>
      </CollapsibleSidebar>
      <section className="flex w-[360px] shrink-0 flex-col border-r">
        <header className="flex h-11 items-center justify-between border-b px-3">
          <span className="text-sm font-semibold">文章</span>
          <span className="text-xs text-muted-foreground">{items.length}</span>
        </header>
        <div className="min-h-0 flex-1 overflow-auto">
          {items.map((entry) => (
            <button
              key={entry.id}
              type="button"
              onClick={() => choose(entry)}
              className={`block w-full border-b p-3 text-left hover:bg-accent/60 ${selectedId === entry.id ? 'bg-accent' : ''}`}
            >
              <div className="flex gap-2">
                <span className="mt-1">
                  {entry.is_read ? (
                    <CircleCheck className="size-3 text-muted-foreground" />
                  ) : (
                    <Circle className="size-3 fill-primary text-primary" />
                  )}
                </span>
                <div className="min-w-0">
                  <div className="line-clamp-2 text-sm font-medium">{entry.title}</div>
                  <div className="mt-1 truncate text-xs text-muted-foreground">
                    {entry.feed_title} · {formatDate(entry.published_at ?? entry.fetched_at)}
                  </div>
                  <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{entry.summary}</p>
                </div>
              </div>
            </button>
          ))}
          {entries.hasNextPage && (
            <Button
              variant="ghost"
              className="m-2 w-[calc(100%-1rem)]"
              onClick={() => entries.fetchNextPage()}
              disabled={entries.isFetchingNextPage}
            >
              加载更多
            </Button>
          )}
          {!entries.isLoading && items.length === 0 && (
            <div className="p-8 text-center text-sm text-muted-foreground">暂无文章</div>
          )}
        </div>
      </section>
      <article className="min-w-0 flex-1 overflow-auto">
        {selected ? (
          <EntryReader
            entry={selected}
            onToggleRead={() => markRead.mutate({ id: selected.id, isRead: !selected.is_read })}
          />
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            <Rss className="mr-2 size-5" />
            选择一篇文章开始阅读
          </div>
        )}
      </article>
      <AddFeedDialog open={addOpen} onOpenChange={setAddOpen} />
      <ManageFeedDialog
        feed={managedFeed}
        onClose={() => setManagedFeed(null)}
        onDeleted={(id) => {
          if (scope.mode === 'feed' && scope.feed_id === id) setScope({ mode: 'all' });
        }}
      />
    </div>
  );
}

function FeedItem({
  feed,
  active,
  onClick,
  onManage,
}: {
  feed: RssFeed;
  active: boolean;
  onClick: () => void;
  onManage: () => void;
}) {
  return (
    <div
      className={`group flex items-center rounded-md ${active ? 'bg-accent' : 'hover:bg-accent/60'}`}
    >
      <button
        type="button"
        onClick={onClick}
        className="flex min-w-0 flex-1 items-center gap-2 px-2 py-1.5 text-sm"
      >
        <span className={`min-w-0 flex-1 truncate text-left ${active ? 'font-medium' : ''}`}>
          {feed.custom_title || feed.title}
        </span>
        {feed.last_error && (
          <span title={feed.last_error}>
            <TriangleAlert className="size-3 shrink-0 text-destructive" />
          </span>
        )}
        <span className="text-xs text-muted-foreground">{feed.unread_count}</span>
      </button>
      <button
        type="button"
        aria-label={`管理 ${feed.custom_title || feed.title}`}
        onClick={onManage}
        className="mr-1 rounded p-1 text-muted-foreground opacity-0 hover:bg-background hover:text-foreground group-hover:opacity-100 focus:opacity-100"
      >
        <Settings2 className="size-3.5" />
      </button>
    </div>
  );
}

function SidebarItem({
  label,
  count,
  active,
  failed,
  onClick,
}: {
  label: string;
  count?: number;
  active: boolean;
  failed?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm ${active ? 'bg-accent font-medium' : 'hover:bg-accent/60'}`}
    >
      <span className="min-w-0 flex-1 truncate text-left">{label}</span>
      {failed && <TriangleAlert className="size-3 text-destructive" />}
      {count !== undefined && <span className="text-xs text-muted-foreground">{count}</span>}
    </button>
  );
}

function EntryReader({ entry, onToggleRead }: { entry: RssEntry; onToggleRead: () => void }) {
  const handleClick = (event: React.MouseEvent) => {
    const anchor = (event.target as HTMLElement).closest('a');
    if (anchor?.href) {
      event.preventDefault();
      void open(anchor.href);
    }
  };
  return (
    <div className="mx-auto max-w-3xl p-8">
      <header className="mb-6 border-b pb-5">
        <h1 className="text-2xl font-bold leading-tight">{entry.title}</h1>
        <div className="mt-3 flex items-center gap-3 text-sm text-muted-foreground">
          <span>{entry.feed_title}</span>
          {entry.author && <span>{entry.author}</span>}
          <span>{formatDate(entry.published_at ?? entry.fetched_at)}</span>
          <Button variant="ghost" size="sm" onClick={onToggleRead}>
            {entry.is_read ? '标为未读' : '标为已读'}
          </Button>
          {entry.link && (
            <Button variant="outline" size="sm" onClick={() => void open(entry.link!)}>
              打开原文
            </Button>
          )}
        </div>
      </header>
      {entry.content_html ? (
        <div
          className="prose prose-neutral max-w-none dark:prose-invert prose-img:max-w-full"
          onClick={handleClick}
          dangerouslySetInnerHTML={{ __html: entry.content_html }}
        />
      ) : (
        <p className="leading-7 text-muted-foreground">{entry.summary}</p>
      )}
    </div>
  );
}

function formatDate(timestamp: number) {
  return new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium' }).format(
    new Date(timestamp * 1000),
  );
}
