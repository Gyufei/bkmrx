import { useEffect, useMemo, useRef, useState } from 'react';
import {
  type InfiniteData,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { open } from '@tauri-apps/plugin-shell';
import { save } from '@tauri-apps/plugin-dialog';
import {
  BookmarkPlus,
  Circle,
  CircleCheck,
  Download,
  ImageOff,
  Languages,
  Pencil,
  Plus,
  RefreshCw,
  Rss,
  Trash2,
  TriangleAlert,
} from 'lucide-react';
import CollapsibleSidebar from '@/components/CollapsibleSidebar';
import ConfirmDeleteDialog from '@/components/ConfirmDeleteDialog';
import { Button } from '@/components/ui/button';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import { toast } from '@/components/ui/toast';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import type { RssEntry, RssEntryPage, RssEntryScope, RssFeed } from '@/types';
import { cn } from '@/lib/utils';
import AddFeedDialog from './AddFeedDialog';
import RenameFeedDialog from './RenameFeedDialog';
import {
  listEntriesApi,
  listFeedsApi,
  deleteFeedApi,
  downloadRssImageApi,
  markEntryReadApi,
  refreshAllFeedsApi,
  refreshFeedApi,
  RSS_ENTRIES_KEY,
  RSS_FEEDS_KEY,
  rssEntriesKey,
} from './rss.api';

export default function RssPage() {
  const client = useQueryClient();
  const [scope, setScope] = useState<RssEntryScope>({ mode: 'all' });
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [hideImages, setHideImages] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [renamingFeed, setRenamingFeed] = useState<RssFeed | null>(null);
  const [deletingFeed, setDeletingFeed] = useState<RssFeed | null>(null);
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
    onSuccess: (updated) => {
      client.setQueriesData<InfiniteData<RssEntryPage>>(
        { queryKey: RSS_ENTRIES_KEY },
        (data) =>
          data && {
            ...data,
            pages: data.pages.map((page) => ({
              ...page,
              entries: page.entries.map((entry) => (entry.id === updated.id ? updated : entry)),
            })),
          },
      );
      void client.invalidateQueries({ queryKey: RSS_FEEDS_KEY });
    },
  });
  const refresh = useMutation({
    mutationFn: refreshAllFeedsApi,
    onSuccess: (result, staleOnly) => {
      invalidate();
      if (!staleOnly)
        toast.add({
          type: result.failed ? 'warning' : 'success',
          title: `刷新 ${result.refreshed} 个订阅，新增 ${result.added} 篇，${result.failed} 个失败`,
        });
    },
  });
  const refreshOne = useMutation({
    mutationFn: refreshFeedApi,
    onSuccess: (result) => {
      invalidate();
      toast.add({ type: 'success', title: `刷新完成，新增 ${result.added} 篇` });
    },
  });
  const remove = useMutation({
    mutationFn: (id: number) => deleteFeedApi(id),
    onSuccess: (_, id) => {
      invalidate();
      if (scope.mode === 'feed' && scope.feed_id === id) setScope({ mode: 'all' });
      setDeletingFeed(null);
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
              refreshing={refreshOne.isPending && refreshOne.variables === feed.id}
              onRename={() => setRenamingFeed(feed)}
              onRefresh={() => refreshOne.mutate(feed.id)}
              onDelete={() => setDeletingFeed(feed)}
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
      <section className="flex w-90 shrink-0 flex-col border-r">
        <header className="flex h-11 items-center justify-between border-b px-3">
          <span className="text-sm font-semibold">文章</span>
          <span className="text-xs text-muted-foreground">{items.length}</span>
        </header>
        <div
          className="min-h-0 flex-1 overflow-auto"
          onScroll={(event) => {
            const element = event.currentTarget;
            if (
              entries.hasNextPage &&
              !entries.isFetchingNextPage &&
              element.scrollHeight - element.scrollTop - element.clientHeight < 120
            ) {
              void entries.fetchNextPage();
            }
          }}
        >
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
                    <Circle className="size-3 fill-chart-5 text-chart-5" />
                  )}
                </span>
                <div className="min-w-0">
                  <div
                    className={cn(
                      'line-clamp-2 text-sm',
                      entry.is_read ? 'font-normal text-muted-foreground' : 'font-semibold',
                    )}
                  >
                    {entry.title}
                  </div>
                  <div className="mt-1 truncate text-xs text-muted-foreground">
                    {entry.feed_title} · {formatDate(entry.published_at ?? entry.fetched_at)}
                  </div>
                  <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{entry.summary}</p>
                </div>
              </div>
            </button>
          ))}
          {entries.isFetchingNextPage && (
            <p className="p-3 text-center text-xs text-muted-foreground">正在加载更多…</p>
          )}
          {!entries.isLoading && items.length === 0 && (
            <div className="p-8 text-center text-sm text-muted-foreground">
              {scope.mode === 'unread' ? '暂无未读文章' : '暂无文章'}
            </div>
          )}
        </div>
      </section>
      <article className="relative min-w-0 flex-1 overflow-hidden">
        {selected ? (
          <>
            <div className="h-full overflow-auto">
              <EntryReader
                entry={selected}
                hideImages={hideImages}
                onToggleRead={() => markRead.mutate({ id: selected.id, isRead: !selected.is_read })}
              />
            </div>
            <ReaderActionBar
              hideImages={hideImages}
              onToggleImages={() => setHideImages((hidden) => !hidden)}
            />
          </>
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            <Rss className="mr-2 size-5" />
            选择一篇文章开始阅读
          </div>
        )}
      </article>
      <AddFeedDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        onExistingFeed={(id) => setScope({ mode: 'feed', feed_id: id })}
      />
      <RenameFeedDialog feed={renamingFeed} onClose={() => setRenamingFeed(null)} />
      <ConfirmDeleteDialog
        open={!!deletingFeed}
        title={`删除订阅“${deletingFeed?.custom_title || deletingFeed?.title}”？`}
        description={`将永久删除该订阅及本地保存的 ${deletingFeed?.entry_count ?? 0} 篇文章。`}
        pending={remove.isPending}
        error={remove.error}
        onOpenChange={(open) => !open && setDeletingFeed(null)}
        onConfirm={() => {
          if (deletingFeed) remove.mutate(deletingFeed.id);
        }}
      />
    </div>
  );
}

function ReaderActionBar({
  hideImages,
  onToggleImages,
}: {
  hideImages: boolean;
  onToggleImages: () => void;
}) {
  const actions = [
    {
      label: hideImages ? '显示图片' : '隐藏图片',
      icon: ImageOff,
      active: hideImages,
      onClick: onToggleImages,
    },
    { label: '翻译', icon: Languages },
    { label: '收藏当前网站到书签', icon: BookmarkPlus },
  ] as const;

  return (
    <TooltipProvider delay={300}>
      <aside
        aria-label="阅读工具"
        className="absolute right-5 top-1/2 flex -translate-y-1/2 flex-col gap-1 rounded-4xl border bg-background/90 p-1.5 shadow-lg backdrop-blur-md"
      >
        {actions.map(({ label, icon: Icon, ...action }) => (
          <Tooltip key={label}>
            <TooltipTrigger
              render={
                <Button
                  variant={'active' in action && action.active ? 'secondary' : 'ghost'}
                  size="icon"
                  aria-label={label}
                  aria-pressed={'active' in action ? action.active : undefined}
                  type="button"
                  onClick={'onClick' in action ? action.onClick : undefined}
                >
                  <Icon />
                </Button>
              }
            />
            <TooltipContent side="left">{label}</TooltipContent>
          </Tooltip>
        ))}
      </aside>
    </TooltipProvider>
  );
}

function FeedItem({
  feed,
  active,
  onClick,
  refreshing,
  onRename,
  onRefresh,
  onDelete,
}: {
  feed: RssFeed;
  active: boolean;
  onClick: () => void;
  refreshing: boolean;
  onRename: () => void;
  onRefresh: () => void;
  onDelete: () => void;
}) {
  return (
    <ContextMenu>
      <ContextMenuTrigger
        render={
          <div
            className={cn(
              'flex items-center rounded-md',
              active ? 'bg-primary/15' : 'hover:bg-accent/60',
            )}
          />
        }
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
          {refreshing && <RefreshCw className="size-3 animate-spin text-muted-foreground" />}
          <span className="text-xs text-muted-foreground">{formatCount(feed.unread_count)}</span>
        </button>
      </ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem onClick={onRename}>
          <Pencil />
          <span>编辑名称</span>
        </ContextMenuItem>
        <ContextMenuItem onClick={onRefresh} disabled={refreshing}>
          <RefreshCw />
          <span>刷新订阅</span>
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem variant="destructive" onClick={onDelete}>
          <Trash2 />
          <span>删除订阅</span>
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
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
      className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm ${active ? 'bg-primary/15 font-medium' : 'hover:bg-accent/60'}`}
    >
      <span className="min-w-0 flex-1 truncate text-left">{label}</span>
      {failed && <TriangleAlert className="size-3 text-destructive" />}
      {count !== undefined && (
        <span className="text-xs text-muted-foreground">{formatCount(count)}</span>
      )}
    </button>
  );
}

function EntryReader({
  entry,
  hideImages,
  onToggleRead,
}: {
  entry: RssEntry;
  hideImages: boolean;
  onToggleRead: () => void;
}) {
  const contentRef = useRef<HTMLDivElement>(null);
  const contextImageUrl = useRef<string | null>(null);
  useEffect(() => {
    const content = contentRef.current;
    content?.querySelectorAll('img').forEach((image) => {
      image.loading = 'lazy';
      image.decoding = 'async';
    });
    const handleContentLink = (event: MouseEvent) => {
      if (event.type === 'auxclick' && event.button !== 1) return;
      if (!(event.target instanceof Element)) return;
      const articleContent = event.target.closest('[data-rss-entry-content]');
      const anchor = event.target.closest('a');
      if (!articleContent || !anchor || !articleContent.contains(anchor)) return;

      event.preventDefault();
      let url: URL;
      try {
        url = new URL(anchor.href);
      } catch {
        return;
      }
      if (url.protocol !== 'http:' && url.protocol !== 'https:') return;

      void open(url.href).catch((reason) => {
        const error = reason instanceof Error ? reason : new Error(String(reason));
        console.error('Failed to open external RSS link', { href: url.href, error });
      });
    };
    document.addEventListener('click', handleContentLink, true);
    document.addEventListener('auxclick', handleContentLink, true);

    return () => {
      document.removeEventListener('click', handleContentLink, true);
      document.removeEventListener('auxclick', handleContentLink, true);
    };
  }, [entry.id, entry.content_html]);
  const handleContextMenu = (event: React.MouseEvent<HTMLDivElement>) => {
    const image = event.target instanceof Element ? event.target.closest('img') : null;
    if (!image || !event.currentTarget.contains(image)) {
      contextImageUrl.current = null;
      event.preventDefault();
      return;
    }
    const imageElement = image as HTMLImageElement;
    contextImageUrl.current = imageElement.currentSrc || imageElement.src;
  };
  const saveImage = async () => {
    const imageUrl = contextImageUrl.current;
    if (!imageUrl) return;
    const destination = await save({
      title: '保存图片',
      defaultPath: suggestedImageName(imageUrl),
      filters: [
        {
          name: '图片',
          extensions: ['jpg', 'jpeg', 'png', 'webp', 'gif', 'avif', 'svg'],
        },
      ],
    });
    if (!destination) return;
    try {
      await downloadRssImageApi(imageUrl, entry.link, destination);
      toast.add({ type: 'success', title: '图片已保存', description: destination });
    } catch (error) {
      toast.add({
        type: 'error',
        title: '图片保存失败',
        description: error instanceof Error ? error.message : String(error),
      });
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
        <div onContextMenuCapture={handleContextMenu}>
          <ContextMenu onOpenChange={(open) => !open && (contextImageUrl.current = null)}>
            <ContextMenuTrigger
              ref={contentRef}
              className="select-text"
              render={
                <div
                  data-rss-entry-content
                  className={cn(
                    'prose prose-neutral max-w-none dark:prose-invert prose-img:h-auto prose-img:max-w-full',
                    hideImages && '[&_img]:hidden',
                  )}
                  dangerouslySetInnerHTML={{ __html: entry.content_html }}
                />
              }
            />
            <ContextMenuContent>
              <ContextMenuItem onClick={() => void saveImage()}>
                <Download />
                保存图片…
              </ContextMenuItem>
            </ContextMenuContent>
          </ContextMenu>
        </div>
      ) : (
        <p className="leading-7 text-muted-foreground">{entry.summary}</p>
      )}
    </div>
  );
}

function suggestedImageName(rawUrl: string) {
  try {
    const candidate = decodeURIComponent(new URL(rawUrl).pathname.split('/').pop() || 'rss-image');
    const sanitized = candidate.replace(/[\\/:*?"<>|]/g, '-').trim();
    return sanitized || 'rss-image';
  } catch {
    return 'rss-image';
  }
}

function formatDate(timestamp: number) {
  return new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium' }).format(
    new Date(timestamp * 1000),
  );
}

function formatCount(count: number) {
  return count > 999 ? '999+' : count;
}
