import {
  invokeCreateRssFeed,
  invokeDeleteRssFeed,
  invokeDownloadRssImage,
  invokeListRssEntries,
  invokeListRssFeeds,
  invokeMarkRssEntryRead,
  invokePreviewRssFeed,
  invokeRefreshAllRssFeeds,
  invokeRefreshRssFeed,
  invokeRenameRssFeed,
} from '@/lib/invoke';
import type { RssEntry, RssEntryPage, RssEntryScope } from '@/types';
import type { InfiniteData, QueryClient } from '@tanstack/react-query';

export const RSS_FEEDS_KEY = ['rss-feeds'] as const;
export const RSS_ENTRIES_KEY = ['rss-entries'] as const;
export const rssEntriesKey = (scope: RssEntryScope) => [...RSS_ENTRIES_KEY, scope] as const;
export const invalidateRssQueries = (queryClient: QueryClient) =>
  Promise.all([
    queryClient.invalidateQueries({ queryKey: RSS_FEEDS_KEY }),
    queryClient.invalidateQueries({ queryKey: RSS_ENTRIES_KEY }),
  ]).then(() => undefined);

export function updateRssEntryQueries(queryClient: QueryClient, updated: RssEntry) {
  queryClient.setQueriesData<InfiniteData<RssEntryPage>>({ queryKey: RSS_ENTRIES_KEY }, (data) =>
    data
      ? {
          ...data,
          pages: data.pages.map((page) => ({
            ...page,
            entries: page.entries.map((entry) => (entry.id === updated.id ? updated : entry)),
          })),
        }
      : data,
  );
}
export const listFeedsApi = invokeListRssFeeds;
export const listEntriesApi = invokeListRssEntries;
export const previewFeedApi = invokePreviewRssFeed;
export const createFeedApi = invokeCreateRssFeed;
export const refreshFeedApi = invokeRefreshRssFeed;
export const refreshAllFeedsApi = invokeRefreshAllRssFeeds;
export const markEntryReadApi = invokeMarkRssEntryRead;
export const renameFeedApi = invokeRenameRssFeed;
export const deleteFeedApi = invokeDeleteRssFeed;
export const downloadRssImageApi = invokeDownloadRssImage;
