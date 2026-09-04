import { useEffect, useRef, useState } from 'react';
import { Rss } from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { Bookmark, RssEntry, RssFeed } from '@/types';
import ConfirmDeleteDialog from '@/components/ConfirmDeleteDialog';
import AddBookmarkDialog from '@/bookmarks/AddBookmarkDialog';
import EditBookmarkDialog from '@/bookmarks/EditBookmarkDialog';
import {
  bookmarkByUrlQueryKey,
  checkBookmarkApi,
} from '@/bookmarks/bookmarks.api';
import { hasErrorCode } from '@/lib/error';
import { toast } from '@/components/ui/toast';
import AddFeedDialog from './AddFeedDialog';
import RenameFeedDialog from './RenameFeedDialog';
import RssEntryList from './RssEntryList';
import RssEntryReader from './RssEntryReader';
import RssSidebar from './RssSidebar';
import { useRssReader } from './use-rss-reader';
import { rssEntryToBookmarkValues } from './rss-bookmark';

export default function RssPage() {
  const reader = useRssReader();
  const queryClient = useQueryClient();
  const [hideImages, setHideImages] = useState(false);
  const [bookmarkAddTarget, setBookmarkAddTarget] = useState<RssEntry | null>(null);
  const [bookmarkEditTarget, setBookmarkEditTarget] = useState<Bookmark | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [renamingFeed, setRenamingFeed] = useState<RssFeed | null>(null);
  const [deletingFeed, setDeletingFeed] = useState<RssFeed | null>(null);
  const selectedLink = reader.selected?.link?.trim() || null;
  const bookmark = useQuery({
    queryKey: bookmarkByUrlQueryKey(selectedLink ?? ''),
    queryFn: () => checkBookmarkApi(selectedLink!),
    enabled: selectedLink !== null,
    refetchOnWindowFocus: true,
  });
  const shownBookmarkError = useRef<string | null>(null);
  useEffect(() => {
    const errorKey = bookmark.isError ? `${selectedLink}:${bookmark.errorUpdatedAt}` : null;
    if (!errorKey || errorKey === shownBookmarkError.current) return;
    shownBookmarkError.current = errorKey;
    toast.add({ type: 'error', title: '收藏状态查询失败' });
  }, [bookmark.errorUpdatedAt, bookmark.isError, selectedLink]);

  const bookmarkState = !selectedLink
    ? ('unavailable' as const)
    : bookmark.isPending
      ? ('loading' as const)
      : bookmark.isError
        ? ('error' as const)
        : bookmark.data
          ? ('saved' as const)
          : ('available' as const);

  const handleBookmark = () => {
    if (bookmarkState === 'error') {
      void bookmark.refetch();
      return;
    }
    if (bookmarkState === 'saved' && bookmark.data) {
      setBookmarkEditTarget(bookmark.data);
      return;
    }
    if (bookmarkState === 'available' && reader.selected) {
      setBookmarkAddTarget(reader.selected);
    }
  };

  const handleBookmarkCreateError = async (error: unknown, values: { url: string }) => {
    if (!hasErrorCode(error, 'bookmark_url_conflict')) return;
    try {
      const existing = await checkBookmarkApi(values.url);
      if (!existing) return;
      queryClient.setQueryData(bookmarkByUrlQueryKey(values.url), existing);
      setBookmarkAddTarget(null);
      setBookmarkEditTarget(existing);
      toast.add({ type: 'info', title: '该文章已收藏，可编辑现有书签' });
    } catch {
      // The add dialog keeps the original conflict visible and preserves the user's input.
    }
  };

  const reportBookmarkSaved = (title: string) => toast.add({ type: 'success', title });
  const deleteSelectedFeed = async () => {
    if (!deletingFeed) return;
    try {
      await reader.remove.mutateAsync(deletingFeed.id);
      setDeletingFeed(null);
    } catch {
      // Keep the confirmation open so it can render the mutation error.
    }
  };

  return (
    <div className="flex min-h-0 flex-1">
      <RssSidebar
        scope={reader.scope}
        feeds={reader.feeds.data ?? []}
        total={reader.total}
        unread={reader.unread}
        refreshPending={reader.refresh.isPending}
        refreshingFeedId={
          reader.refreshOne.isPending ? (reader.refreshOne.variables ?? null) : null
        }
        onScopeChange={reader.setScope}
        onAdd={() => setAddOpen(true)}
        onRefreshAll={() => reader.refresh.mutate(false)}
        onRename={setRenamingFeed}
        onRefresh={(feed) => reader.refreshOne.mutate(feed.id)}
        onDelete={setDeletingFeed}
      />
      <RssEntryList
        scope={reader.scope}
        items={reader.items}
        selectedId={reader.selectedId}
        loading={reader.entries.isLoading}
        fetchingNext={reader.entries.isFetchingNextPage}
        hasNextPage={reader.entries.hasNextPage}
        onChoose={reader.choose}
        onLoadMore={() => void reader.entries.fetchNextPage()}
      />
      <article className="relative min-w-0 flex-1 overflow-hidden">
        {reader.selected ? (
          <RssEntryReader
            entry={reader.selected}
            hideImages={hideImages}
            bookmarkState={bookmarkState}
            onToggleImages={() => setHideImages((hidden) => !hidden)}
            onBookmark={handleBookmark}
            onToggleRead={() =>
              reader.markRead.mutate({ id: reader.selected!.id, isRead: !reader.selected!.is_read })
            }
          />
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            <Rss className="mr-2 size-5" />
            选择一篇文章开始阅读
          </div>
        )}
      </article>
      <AddBookmarkDialog
        open={bookmarkAddTarget !== null}
        onOpenChange={(open) => !open && setBookmarkAddTarget(null)}
        initialValues={bookmarkAddTarget ? rssEntryToBookmarkValues(bookmarkAddTarget) : undefined}
        onCreated={() => reportBookmarkSaved('收藏成功')}
        onCreateError={(error, values) => void handleBookmarkCreateError(error, values)}
      />
      <EditBookmarkDialog
        editTarget={bookmarkEditTarget}
        setEditTarget={setBookmarkEditTarget}
        onUpdated={() => reportBookmarkSaved('书签更新成功')}
      />
      <AddFeedDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        onExistingFeed={(id) => reader.setScope({ mode: 'feed', feed_id: id })}
      />
      <RenameFeedDialog
        key={renamingFeed?.id ?? 'closed'}
        feed={renamingFeed}
        onClose={() => setRenamingFeed(null)}
      />
      <ConfirmDeleteDialog
        open={!!deletingFeed}
        title={`删除订阅“${deletingFeed?.custom_title || deletingFeed?.title}”？`}
        description={`将永久删除该订阅及本地保存的 ${deletingFeed?.entry_count ?? 0} 篇文章。`}
        pending={reader.remove.isPending}
        error={reader.remove.error}
        onOpenChange={(open) => !open && setDeletingFeed(null)}
        onConfirm={deleteSelectedFeed}
      />
    </div>
  );
}
