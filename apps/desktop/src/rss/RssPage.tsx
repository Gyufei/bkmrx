import { useState } from 'react';
import { Rss } from 'lucide-react';
import type { RssFeed } from '@/types';
import ConfirmDeleteDialog from '@/components/ConfirmDeleteDialog';
import AddFeedDialog from './AddFeedDialog';
import RenameFeedDialog from './RenameFeedDialog';
import RssEntryList from './RssEntryList';
import RssEntryReader from './RssEntryReader';
import RssSidebar from './RssSidebar';
import { useRssReader } from './use-rss-reader';

export default function RssPage() {
  const reader = useRssReader();
  const [hideImages, setHideImages] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [renamingFeed, setRenamingFeed] = useState<RssFeed | null>(null);
  const [deletingFeed, setDeletingFeed] = useState<RssFeed | null>(null);
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
            onToggleImages={() => setHideImages((hidden) => !hidden)}
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
