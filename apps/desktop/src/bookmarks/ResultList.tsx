import { useEffect, useRef, useState } from 'react';
import type { BookmarkId } from '@/identity';
import type { Bookmark } from '@/types';
import { useInfiniteScroll } from '@/hooks/use-infinite-scroll';
import { PageError, PageLoading } from '@/components/PageStatus';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Empty, EmptyDescription } from '@/components/ui/empty';
import AddBookmarkToNavigationDialog from './AddBookmarkToNavigationDialog';
import BookmarkResultItem from './BookmarkResultItem';
import DeleteBkDialog from './DeleteBkDialog';
import EditBookmarkDialog from './EditBookmarkDialog';

interface Props {
  bookmarks: Bookmark[];
  initialLoading: boolean;
  initialError: string | null;
  hasMore: boolean;
  isFetchingNextPage: boolean;
  nextPageError: string | null;
  onLoadMore(): void;
  onRetryNextPage(): void;
  starredView: boolean;
  emptyMessage: string;
  starPendingId: BookmarkId | null;
  onToggleStarred(bookmark: Bookmark, starred: boolean): void;
  onPreviewBookmark(bookmark: Bookmark, trigger: HTMLElement): void;
  onOpenBookmark(bookmark: Bookmark): void;
  activeBookmarkId: BookmarkId | null;
  onActiveBookmarkChange(id: BookmarkId): void;
  onBookmarkElementChange(id: BookmarkId, element: HTMLElement | null): void;
  onInteractionLockChange(locked: boolean): void;
}

export default function ResultList(props: Props) {
  const sentinelRef = useRef<HTMLDivElement>(null);
  const targets = useDialogTargets(props.onInteractionLockChange);
  useInfiniteScroll({
    sentinelRef,
    hasMore: props.hasMore,
    isFetching: props.isFetchingNextPage,
    hasError: !!props.nextPageError,
    onLoadMore: props.onLoadMore,
  });
  if (props.initialError)
    return <PageError title={props.initialError} className="h-48 px-4" />;
  if (props.initialLoading) return <PageLoading text="加载中..." className="h-48" />;
  if (props.bookmarks.length === 0)
    return (
      <Empty className="h-48">
        <EmptyDescription>{props.emptyMessage}</EmptyDescription>
      </Empty>
    );
  return <BookmarkResults props={props} targets={targets} sentinelRef={sentinelRef} />;
}

function useDialogTargets(onInteractionLockChange: Props['onInteractionLockChange']) {
  const [deleteTarget, setDeleteTarget] = useState<Bookmark | null>(null);
  const [editTarget, setEditTarget] = useState<Bookmark | null>(null);
  const [navigationTarget, setNavigationTarget] = useState<Bookmark | null>(null);
  useEffect(() => {
    onInteractionLockChange(Boolean(deleteTarget || editTarget || navigationTarget));
    return () => onInteractionLockChange(false);
  }, [deleteTarget, editTarget, navigationTarget, onInteractionLockChange]);
  return {
    deleteTarget,
    setDeleteTarget,
    editTarget,
    setEditTarget,
    navigationTarget,
    setNavigationTarget,
  };
}

type Targets = ReturnType<typeof useDialogTargets>;

function BookmarkResults({
  props,
  targets,
  sentinelRef,
}: {
  props: Props;
  targets: Targets;
  sentinelRef: React.RefObject<HTMLDivElement | null>;
}) {
  return (
    <div className="flex flex-col gap-1">
      {props.bookmarks.map((bookmark) => (
        <BookmarkResultItem
          key={bookmark.id}
          bookmark={bookmark}
          starredView={props.starredView}
          starPending={props.starPendingId === bookmark.id}
          active={props.activeBookmarkId === bookmark.id}
          onToggleStarred={props.onToggleStarred}
          onPreviewBookmark={props.onPreviewBookmark}
          onOpenBookmark={props.onOpenBookmark}
          onActiveBookmarkChange={props.onActiveBookmarkChange}
          onElementChange={props.onBookmarkElementChange}
          onRequestNavigation={targets.setNavigationTarget}
          onRequestEdit={targets.setEditTarget}
          onRequestDelete={targets.setDeleteTarget}
        />
      ))}
      <DeleteBkDialog
        deleteTarget={targets.deleteTarget}
        setDeleteTarget={targets.setDeleteTarget}
      />
      <EditBookmarkDialog editTarget={targets.editTarget} setEditTarget={targets.setEditTarget} />
      <AddBookmarkToNavigationDialog
        bookmark={targets.navigationTarget}
        onOpenChange={(open) => !open && targets.setNavigationTarget(null)}
      />
      <div ref={sentinelRef} className="h-4" />
      <PaginationStatus {...props} />
    </div>
  );
}

function PaginationStatus(props: Props) {
  if (props.isFetchingNextPage)
    return <PageLoading text="加载中..." className="py-4" />;
  if (props.nextPageError)
    return (
      <Alert variant="destructive" className="flex items-center justify-center gap-2 border-0 py-2">
        <AlertDescription>{props.nextPageError}</AlertDescription>
        <Button variant="link" size="xs" onClick={props.onRetryNextPage}>
          重试
        </Button>
      </Alert>
    );
  if (!props.hasMore)
    return (
      <div className="text-center py-4 text-sm text-muted-foreground">
        已显示全部 {props.bookmarks.length} 条结果
      </div>
    );
  return null;
}
