import { Circle, CircleCheck } from 'lucide-react';
import type { RssEntry, RssEntryScope } from '@/types';
import type { RssEntryId } from '@/identity';
import { cn } from '@/lib/utils';
import { Alert, AlertTitle } from '@/components/ui/alert';
import { Empty, EmptyDescription, EmptyTitle } from '@/components/ui/empty';
import { Spinner } from '@/components/ui/spinner';

interface Props {
  scope: RssEntryScope;
  items: RssEntry[];
  selectedId: RssEntryId | null;
  loading: boolean;
  error: boolean;
  fetchingNext: boolean;
  hasNextPage: boolean;
  onChoose: (entry: RssEntry) => void;
  onLoadMore: () => void;
}

export default function RssEntryList({
  scope,
  items,
  selectedId,
  loading,
  error,
  fetchingNext,
  hasNextPage,
  onChoose,
  onLoadMore,
}: Props) {
  return (
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
            hasNextPage &&
            !fetchingNext &&
            element.scrollHeight - element.scrollTop - element.clientHeight < 120
          )
            onLoadMore();
        }}
      >
        {error && items.length === 0 ? (
          <div className="flex h-full items-center justify-center p-4">
            <Alert variant="destructive" className="text-center">
              <AlertTitle>文章加载失败</AlertTitle>
            </Alert>
          </div>
        ) : (
          items.map((entry) => (
            <button
              key={entry.id}
              type="button"
              onClick={() => onChoose(entry)}
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
          ))
        )}
        {fetchingNext && <Spinner className="mx-auto my-3" />}
        {!error && loading && items.length === 0 && (
          <div
            role="status"
            className="flex h-full items-center justify-center gap-2 text-sm text-muted-foreground"
          >
            <Spinner />
            <span>正在加载文章…</span>
          </div>
        )}
        {!error && !loading && items.length === 0 && (
          <Empty className="h-full p-8">
            <EmptyTitle>{scope.mode === 'unread' ? '暂无未读文章' : '暂无文章'}</EmptyTitle>
            <EmptyDescription>
              {scope.mode === 'unread' ? '所有文章都已读完。' : '刷新订阅后，新文章会显示在这里。'}
            </EmptyDescription>
          </Empty>
        )}
      </div>
    </section>
  );
}

function formatDate(timestamp: number) {
  return new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium' }).format(
    new Date(timestamp * 1000),
  );
}
