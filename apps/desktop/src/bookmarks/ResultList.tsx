import { useRef, useEffect, useCallback, useState } from 'react';
import { ExternalLink, Link, Code, Pencil, Trash2 } from 'lucide-react';
import {
  ContextMenu,
  ContextMenuTrigger,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
} from '@/components/ui/context-menu';
import EditBookmarkDialog from './EditBookmarkDialog';
import { tagColor } from '../lib/tagColor';
import { open } from '@tauri-apps/plugin-shell';
import { invokeRecordBookmarkAccess } from '../lib/invoke';
import type { Bookmark } from '../types';
import DeleteBkDialog from './DeleteBkDialog';

interface Props {
  bookmarks: Bookmark[];
  initialLoading: boolean;
  initialError: string | null;
  hasMore: boolean;
  isFetchingNextPage: boolean;
  nextPageError: string | null;
  onLoadMore: () => void;
  onRetryNextPage: () => void;
}

export default function ResultList({
  bookmarks,
  initialLoading,
  initialError,
  hasMore,
  isFetchingNextPage,
  nextPageError,
  onLoadMore,
  onRetryNextPage,
}: Props) {
  const sentinelRef = useRef<HTMLDivElement>(null);

  const [deleteTarget, setDeleteTarget] = useState<Bookmark | null>(null);
  const [editTarget, setEditTarget] = useState<Bookmark | null>(null);

  const handleIntersect = useCallback(
    (entries: IntersectionObserverEntry[]) => {
      if (
        entries[0]?.isIntersecting &&
        hasMore &&
        !isFetchingNextPage &&
        !nextPageError
      ) {
        onLoadMore();
      }
    },
    [hasMore, isFetchingNextPage, nextPageError, onLoadMore],
  );

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(handleIntersect, {
      rootMargin: '200px',
    });
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [handleIntersect]);

  if (initialError) {
    return (
      <div className="flex items-center justify-center h-48 text-sm text-destructive">
        {initialError}
      </div>
    );
  }

  if (initialLoading) {
    return (
      <div className="flex items-center justify-center h-48 text-sm text-muted-foreground">
        加载中...
      </div>
    );
  }

  if (bookmarks.length === 0) {
    return (
      <div className="flex items-center justify-center h-48 text-sm text-muted-foreground">
        暂无匹配的书签
      </div>
    );
  }

  return (
    <div className="space-y-1">
      {bookmarks.map((bm) => (
        <ContextMenu key={bm.id}>
          <ContextMenuTrigger>
            <BookmarkRow bookmark={bm} onRequestDelete={setDeleteTarget} />
          </ContextMenuTrigger>
          <ContextMenuContent>
            <ContextMenuItem
              onClick={async () => {
                open(bm.url);
                try {
                  await invokeRecordBookmarkAccess(bm.id);
                } catch {
                  console.error('Failed to record bookmark access');
                }
              }}
            >
              <ExternalLink className="h-4 w-4" />
              <span>打开链接</span>
            </ContextMenuItem>
            <ContextMenuItem
              onClick={() => {
                navigator.clipboard.writeText(bm.url).catch(() => {});
              }}
            >
              <Link className="h-4 w-4" />
              <span>复制链接</span>
            </ContextMenuItem>
            <ContextMenuItem
              onClick={() => {
                const text = bm.title ? `[${bm.title}](${bm.url})` : bm.url;
                navigator.clipboard.writeText(text).catch(() => {});
              }}
            >
              <Code className="h-4 w-4" />
              <span>复制为 Markdown</span>
            </ContextMenuItem>
            <ContextMenuSeparator />
            <ContextMenuItem onClick={() => setEditTarget(bm)}>
              <Pencil className="h-4 w-4" />
              <span>编辑</span>
            </ContextMenuItem>
            <ContextMenuItem onClick={() => setDeleteTarget(bm)}>
              <Trash2 className="h-4 w-4" />
              <span className="text-destructive">删除</span>
            </ContextMenuItem>
          </ContextMenuContent>
        </ContextMenu>
      ))}

      <DeleteBkDialog
        deleteTarget={deleteTarget}
        setDeleteTarget={setDeleteTarget}
      />

      <EditBookmarkDialog
        editTarget={editTarget}
        setEditTarget={setEditTarget}
      />

      {/* Sentinel for infinite scroll */}
      <div ref={sentinelRef} className="h-4" />

      {/* Loading indicator */}
      {isFetchingNextPage && (
        <div className="flex items-center justify-center py-4 text-sm text-muted-foreground">
          <div className="w-4 h-4 mr-2 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          加载中...
        </div>
      )}

      {nextPageError && (
        <div className="flex items-center justify-center gap-2 py-4 text-sm text-destructive">
          <span>{nextPageError}</span>
          <button className="underline" onClick={onRetryNextPage}>
            重试
          </button>
        </div>
      )}

      {/* All loaded */}
      {!hasMore && !nextPageError && bookmarks.length > 0 && (
        <div className="text-center py-4 text-sm text-muted-foreground">
          已显示全部 {bookmarks.length} 条结果
        </div>
      )}
    </div>
  );
}

function BookmarkRow({
  bookmark,
  onRequestDelete,
}: {
  bookmark: Bookmark;
  onRequestDelete: (bm: Bookmark) => void;
}) {
  const handleClick = async () => {
    open(bookmark.url);
    try {
      await invokeRecordBookmarkAccess(bookmark.id);
    } catch {
      console.error('Failed to record bookmark access');
    }
  };

  return (
    <div className="group relative">
      <div
        onClick={handleClick}
        className="block px-4 py-3 rounded-md hover:bg-accent dark:hover:bg-accent cursor-pointer transition-colors"
      >
        <div className="text-base font-medium text-foreground group-hover:text-primary transition-colors truncate pr-6">
          {bookmark.title || bookmark.url}
        </div>
        <div className="text-xs text-muted-foreground truncate mt-0.5">{bookmark.url}</div>
        {bookmark.description && (
          <div className="text-xs text-muted-foreground mt-1 line-clamp-2">
            {bookmark.description}
          </div>
        )}
        {bookmark.access_count > 0 && (
          <div className="text-xs text-muted-foreground opacity-60 mt-1">
            {bookmark.access_count} 次访问
          </div>
        )}
        {bookmark.tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1.5">
            {bookmark.tags.map((tag) => (
              <span
                key={tag}
                className="inline-block px-2 py-0.5 text-xs rounded-md"
                style={tagColor(tag)}
              >
                {tag}
              </span>
            ))}
          </div>
        )}
      </div>
      <button
        onClick={(e) => {
          e.stopPropagation();
          onRequestDelete(bookmark);
        }}
        className="absolute right-2 top-2 opacity-0 group-hover:opacity-100 transition-opacity duration-150 p-1.5 rounded-md text-muted-foreground hover:text-destructive dark:hover:text-destructive hover:bg-destructive/10 dark:hover:bg-destructive/10"
        title="删除书签"
      >
        <Trash2 className="h-4 w-4" />
      </button>
    </div>
  );
}
