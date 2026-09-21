import { useCallback, useEffect, type RefObject } from 'react';

interface UseInfiniteScrollOptions {
  sentinelRef: RefObject<HTMLElement | null>;
  hasMore: boolean;
  isFetching: boolean;
  hasError: boolean;
  onLoadMore: () => void;
}

export function useInfiniteScroll({
  sentinelRef,
  hasMore,
  isFetching,
  hasError,
  onLoadMore,
}: UseInfiniteScrollOptions) {
  const handleIntersect = useCallback(
    (entries: IntersectionObserverEntry[]) => {
      if (entries[0]?.isIntersecting && hasMore && !isFetching && !hasError) onLoadMore();
    },
    [hasMore, isFetching, hasError, onLoadMore],
  );

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(handleIntersect, { rootMargin: '200px' });
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [handleIntersect, sentinelRef]);
}
