import { useRef, useEffect, useCallback } from "react";
import { tagColor } from "../utils/tagColor";
import { open } from "@tauri-apps/plugin-shell";
import type { Bookmark } from "../types";

interface Props {
  bookmarks: Bookmark[];
  loading: boolean;
  error: string | null;
  hasMore: boolean;
  onLoadMore: () => void;
}

export default function ResultList({ bookmarks, loading, error, hasMore, onLoadMore }: Props) {
  const sentinelRef = useRef<HTMLDivElement>(null);

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
      <div className="flex items-center justify-center h-48 text-sm text-danger dark:text-danger-dark">
        {error}
      </div>
    );
  }

  if (!loading && bookmarks.length === 0) {
    return (
      <div className="flex items-center justify-center h-48 text-sm text-text-secondary dark:text-text-dark-secondary">
        输入关键词搜索书签
      </div>
    );
  }

  return (
    <div className="space-y-1">
      {bookmarks.map((bm) => (
        <BookmarkRow key={bm.id} bookmark={bm} />
      ))}

      {/* Sentinel for infinite scroll */}
      <div ref={sentinelRef} className="h-4" />

      {/* Loading indicator */}
      {loading && bookmarks.length > 0 && (
        <div className="flex items-center justify-center py-4 text-sm text-text-secondary dark:text-text-dark-secondary">
          <div className="w-4 h-4 mr-2 border-2 border-accent dark:border-accent-dark border-t-transparent rounded-full animate-spin" />
          加载中...
        </div>
      )}

      {/* All loaded */}
      {!hasMore && bookmarks.length > 0 && (
        <div className="text-center py-4 text-sm text-text-secondary dark:text-text-dark-secondary">
          已显示全部 {bookmarks.length} 条结果
        </div>
      )}
    </div>
  );
}

function BookmarkRow({ bookmark }: { bookmark: Bookmark }) {
  const handleClick = () => {
    open(bookmark.url);
  };

  return (
    <div
      onClick={handleClick}
      className="block px-4 py-3 rounded-card hover:bg-accent-bg dark:hover:bg-accent-dark-bg cursor-pointer transition-colors group"
    >
      <div className="text-base font-medium text-text-primary dark:text-text-dark-primary group-hover:text-accent dark:group-hover:text-accent-dark transition-colors truncate">
        {bookmark.title || bookmark.url}
      </div>
      <div className="text-xs text-text-secondary dark:text-text-dark-secondary truncate mt-0.5">
        {bookmark.url}
      </div>
      {bookmark.tags.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-1.5">
          {bookmark.tags.map((tag) => (
            <span
              key={tag}
              className="inline-block px-2 py-0.5 text-xs rounded-chip"
              style={tagColor(tag)}
            >
              {tag}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
