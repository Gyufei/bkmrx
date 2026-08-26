import { Pencil, Plus, RefreshCw, Trash2, TriangleAlert } from 'lucide-react';
import type { RssEntryScope, RssFeed } from '@/types';
import CollapsibleSidebar from '@/components/CollapsibleSidebar';
import { Button } from '@/components/ui/button';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import { cn } from '@/lib/utils';

interface Props {
  scope: RssEntryScope;
  feeds: RssFeed[];
  total: number;
  unread: number;
  refreshPending: boolean;
  refreshingFeedId: number | null;
  onScopeChange: (scope: RssEntryScope) => void;
  onAdd: () => void;
  onRefreshAll: () => void;
  onRename: (feed: RssFeed) => void;
  onRefresh: (feed: RssFeed) => void;
  onDelete: (feed: RssFeed) => void;
}

export default function RssSidebar({
  scope,
  feeds,
  total,
  unread,
  refreshPending,
  refreshingFeedId,
  onScopeChange,
  onAdd,
  onRefreshAll,
  onRename,
  onRefresh,
  onDelete,
}: Props) {
  return (
    <CollapsibleSidebar title="RSS" className="w-60" contentClassName="flex flex-col">
      <div className="space-y-1 p-2">
        <SidebarItem
          active={scope.mode === 'all'}
          label="全部文章"
          count={total}
          onClick={() => onScopeChange({ mode: 'all' })}
        />
        <SidebarItem
          active={scope.mode === 'unread'}
          label="未读"
          count={unread}
          onClick={() => onScopeChange({ mode: 'unread' })}
        />
      </div>
      <div className="flex items-center justify-between px-3 py-2 text-xs font-medium text-muted-foreground">
        <span>订阅源</span>
        <Button variant="ghost" size="icon-sm" onClick={onAdd} title="添加订阅">
          <Plus />
        </Button>
      </div>
      <div className="min-h-0 flex-1 overflow-auto px-2 pb-2">
        {feeds.map((feed) => (
          <FeedItem
            key={feed.id}
            feed={feed}
            active={scope.mode === 'feed' && scope.feed_id === feed.id}
            refreshing={refreshingFeedId === feed.id}
            onClick={() => onScopeChange({ mode: 'feed', feed_id: feed.id })}
            onRename={() => onRename(feed)}
            onRefresh={() => onRefresh(feed)}
            onDelete={() => onDelete(feed)}
          />
        ))}
      </div>
      <div className="border-t p-2">
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start"
          disabled={refreshPending}
          onClick={onRefreshAll}
        >
          <RefreshCw className={refreshPending ? 'animate-spin' : ''} />
          刷新全部
        </Button>
      </div>
    </CollapsibleSidebar>
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
  onClick,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm ${active ? 'bg-primary/15 font-medium' : 'hover:bg-accent/60'}`}
    >
      <span className="min-w-0 flex-1 truncate text-left">{label}</span>
      <span className="text-xs text-muted-foreground">{formatCount(count)}</span>
    </button>
  );
}

function formatCount(count: number) {
  return count > 999 ? '999+' : count;
}
