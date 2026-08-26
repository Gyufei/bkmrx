import { Circle, CircleCheck } from 'lucide-react';
import type { RssEntry, RssEntryScope } from '@/types';
import { cn } from '@/lib/utils';

interface Props {
  scope: RssEntryScope;
  items: RssEntry[];
  selectedId: number | null;
  loading: boolean;
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
        {items.map((entry) => (
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
        ))}
        {fetchingNext && (
          <p className="p-3 text-center text-xs text-muted-foreground">正在加载更多…</p>
        )}
        {!loading && items.length === 0 && (
          <div className="p-8 text-center text-sm text-muted-foreground">
            {scope.mode === 'unread' ? '暂无未读文章' : '暂无文章'}
          </div>
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
