import { useEffect, useMemo, useState } from 'react';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { RssEntry, RssEntryScope } from '@/types';
import { toast } from '@/components/ui/toast';
import { getErrorMessage } from '@/lib/error';
import {
  deleteFeedApi,
  invalidateRssQueries,
  listEntriesApi,
  listFeedsApi,
  markEntryReadApi,
  refreshAllFeedsApi,
  refreshFeedApi,
  RSS_FEEDS_KEY,
  rssEntriesKey,
  updateRssEntryQueries,
} from './rss.api';

export function useRssReader() {
  const queryClient = useQueryClient();
  const [scope, setScope] = useState<RssEntryScope>({ mode: 'all' });
  const [selectedId, setSelectedId] = useState<number | null>(null);
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
  const reportError = (error: unknown) => {
    toast.add({ type: 'error', title: getErrorMessage(error, 'RSS 操作失败') });
  };
  const markRead = useMutation({
    mutationFn: ({ id, isRead }: { id: number; isRead: boolean }) => markEntryReadApi(id, isRead),
    onSuccess: (updated) => {
      updateRssEntryQueries(queryClient, updated);
      void queryClient.invalidateQueries({ queryKey: RSS_FEEDS_KEY });
    },
    onError: reportError,
  });
  const refresh = useMutation({
    mutationFn: refreshAllFeedsApi,
    onSuccess: (result, staleOnly) => {
      void invalidateRssQueries(queryClient);
      if (!staleOnly)
        toast.add({
          type: result.failed ? 'warning' : 'success',
          title: `刷新 ${result.refreshed} 个订阅，新增 ${result.added} 篇，${result.failed} 个失败`,
        });
    },
    onError: reportError,
  });
  const refreshOne = useMutation({
    mutationFn: refreshFeedApi,
    onSuccess: (result) => {
      void invalidateRssQueries(queryClient);
      toast.add({ type: 'success', title: `刷新完成，新增 ${result.added} 篇` });
    },
    onError: reportError,
  });
  const remove = useMutation({
    mutationFn: deleteFeedApi,
    onSuccess: (_result, id) => {
      void invalidateRssQueries(queryClient);
      if (scope.mode === 'feed' && scope.feed_id === id) setScope({ mode: 'all' });
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
  return {
    scope,
    setScope,
    feeds,
    entries,
    items,
    selected,
    selectedId,
    total,
    unread,
    markRead,
    refresh,
    refreshOne,
    remove,
    choose,
  };
}
