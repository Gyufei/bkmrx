import { useRef, useEffect, useCallback, useState } from "react";
import { ExternalLink, Link, Code, Pencil, Trash2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  ContextMenu,
  ContextMenuTrigger,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
} from "@/components/ui/context-menu";
import { Button } from "@/components/ui/button";
import EditBookmarkDialog from "./EditBookmarkDialog";
import { tagColor } from "../lib/tagColor";
import { open } from "@tauri-apps/plugin-shell";
import { invoke } from "@tauri-apps/api/core";
import type { Bookmark, Tag } from "../types";

interface Props {
  bookmarks: Bookmark[];
  loading: boolean;
  error: string | null;
  hasMore: boolean;
  onLoadMore: () => void;
  onDeleteBookmark: (id: number) => void;
  onUpdateBookmark: (id: number, title: string, tags: string[], description?: string) => Promise<void>;
  fetchTags: () => Promise<Tag[]>;
}

export default function ResultList({ bookmarks, loading, error, hasMore, onLoadMore, onDeleteBookmark, onUpdateBookmark, fetchTags }: Props) {
  const sentinelRef = useRef<HTMLDivElement>(null);
  const [deleteTarget, setDeleteTarget] = useState<Bookmark | null>(null);
  const [editTarget, setEditTarget] = useState<Bookmark | null>(null);

  const handleIntersect = useCallback(
    (entries: IntersectionObserverEntry[]) => {
      if (entries[0]?.isIntersecting && hasMore && !loading) {
        onLoadMore();
      }
    },
    [hasMore, loading, onLoadMore]
  );

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(handleIntersect, {
      rootMargin: "200px",
    });
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [handleIntersect]);

  if (error) {
    return (
      <div className="flex items-center justify-center h-48 text-sm text-destructive">
        {error}
      </div>
    );
  }

  if (!loading && bookmarks.length === 0) {
    return (
      <div className="flex items-center justify-center h-48 text-sm text-muted-foreground">
        输入关键词搜索书签
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
            <ContextMenuItem onClick={() => { open(bm.url); invoke("record_bookmark_access", { id: bm.id }).catch(() => {}); }}>
              <ExternalLink className="h-4 w-4" />
              <span>打开链接</span>
            </ContextMenuItem>
            <ContextMenuItem onClick={() => { navigator.clipboard.writeText(bm.url).catch(() => {}); }}>
              <Link className="h-4 w-4" />
              <span>复制链接</span>
            </ContextMenuItem>
            <ContextMenuItem onClick={() => {
              const text = bm.title ? `[${bm.title}](${bm.url})` : bm.url;
              navigator.clipboard.writeText(text).catch(() => {});
            }}>
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

      {/* Delete confirmation dialog */}
      <Dialog open={deleteTarget !== null} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>确认删除</DialogTitle>
            <DialogDescription>
              确定要删除书签「{deleteTarget?.title || deleteTarget?.url}」吗？此操作不可撤销。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>取消</Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (deleteTarget) {
                  onDeleteBookmark(deleteTarget.id);
                  setDeleteTarget(null);
                }
              }}
            >
              删除
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <EditBookmarkDialog
        bookmark={editTarget}
        onOpenChange={(open) => { if (!open) setEditTarget(null); }}
        onUpdate={onUpdateBookmark}
        fetchTags={fetchTags}
      />

      {/* Sentinel for infinite scroll */}
      <div ref={sentinelRef} className="h-4" />

      {/* Loading indicator */}
      {loading && bookmarks.length > 0 && (
        <div className="flex items-center justify-center py-4 text-sm text-muted-foreground">
          <div className="w-4 h-4 mr-2 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          加载中...
        </div>
      )}

      {/* All loaded */}
      {!hasMore && bookmarks.length > 0 && (
        <div className="text-center py-4 text-sm text-muted-foreground">
          已显示全部 {bookmarks.length} 条结果
        </div>
      )}
    </div>
  );
}

function BookmarkRow({ bookmark, onRequestDelete }: { bookmark: Bookmark; onRequestDelete: (bm: Bookmark) => void }) {
  const handleClick = () => {
    open(bookmark.url);
    invoke("record_bookmark_access", { id: bookmark.id }).catch(() => {});
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
        <div className="text-xs text-muted-foreground truncate mt-0.5">
          {bookmark.url}
        </div>
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
        onClick={(e) => { e.stopPropagation(); onRequestDelete(bookmark); }}
        className="absolute right-2 top-2 opacity-0 group-hover:opacity-100 transition-opacity duration-150 p-1.5 rounded-md text-muted-foreground hover:text-destructive dark:hover:text-destructive hover:bg-destructive/10 dark:hover:bg-destructive/10"
        title="删除书签"
      >
        <Trash2 className="h-4 w-4" />
      </button>
    </div>
  );
}
