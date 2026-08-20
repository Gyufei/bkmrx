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
import type { RssEntryScope } from '@/types';

export const RSS_FEEDS_KEY = ['rss-feeds'] as const;
export const RSS_ENTRIES_KEY = ['rss-entries'] as const;
export const rssEntriesKey = (scope: RssEntryScope) => [...RSS_ENTRIES_KEY, scope] as const;
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
