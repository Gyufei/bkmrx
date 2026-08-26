import { useRef, useState } from 'react';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import CollapsibleSidebar from '@/components/CollapsibleSidebar';
import AddBookmarkDialog from './AddBookmarkDialog';
import BookmarkSidebar from './BookmarkSidebar';
import BookmarkWebPreview from './BookmarkWebPreview';
import ResultList from './ResultList';
import SearchBar from './SearchBar';
import { useBookmarkBrowser } from './use-bookmark-browser';
import { useBookmarkNavigation } from './use-bookmark-navigation';

export default function BookmarkView() {
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [resultListInteractionLocked, setResultListInteractionLocked] = useState(false);
  const [previewContainer, setPreviewContainer] = useState<HTMLDivElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const browser = useBookmarkBrowser();
  const navigation = useBookmarkNavigation({
    bookmarks: browser.bookmarks,
    singleKeyLocked: showAddDialog || resultListInteractionLocked,
    searchInputRef,
  });

  return (
    <div ref={setPreviewContainer} className="relative flex min-h-0 w-full flex-1 overflow-hidden">
      <CollapsibleSidebar title="标签" className="w-56" contentClassName="px-3 pb-3">
        <BookmarkSidebar
          selectedTags={browser.selectedTags}
          onTagsChange={browser.handleTagsChange}
          baseView={browser.baseView}
          onBaseViewChange={browser.handleBaseViewChange}
          randomDrawing={browser.randomDrawing}
        />
      </CollapsibleSidebar>
      <main className="flex min-w-0 flex-1 flex-col overflow-hidden bg-background">
        <header className="shrink-0 border-b border-border px-4 py-3">
          <div className="flex items-center gap-2">
            <SearchBar
              ref={searchInputRef}
              onSearch={browser.handleSearch}
              loading={browser.bookmarksQuery.isLoading}
            />
            <Button
              variant="outline"
              className="flex size-10 shrink-0 items-center justify-center !px-0"
              onClick={() => setShowAddDialog(true)}
              title="添加书签"
            >
              <Plus />
            </Button>
          </div>
        </header>
        {browser.starMutation.isError && (
          <div
            role="alert"
            className="shrink-0 border-b border-border px-4 py-2 text-sm text-destructive"
          >
            更新星标失败：{browser.starMutation.error.message}
          </div>
        )}
        <div className="flex-1 overflow-y-auto p-3">
          <ResultList
            bookmarks={browser.bookmarks}
            initialLoading={browser.bookmarksQuery.isLoading}
            initialError={
              browser.bookmarksQuery.isError && (browser.randomView || !browser.bookmarksQuery.data)
                ? browser.bookmarksQuery.error.message
                : null
            }
            hasMore={browser.bookmarksQuery.hasNextPage}
            isFetchingNextPage={browser.bookmarksQuery.isFetchingNextPage}
            nextPageError={
              browser.bookmarksQuery.isFetchNextPageError
                ? browser.bookmarksQuery.error.message
                : null
            }
            onLoadMore={() => browser.bookmarksQuery.fetchNextPage()}
            onRetryNextPage={() => browser.bookmarksQuery.fetchNextPage()}
            starredView={browser.starredView}
            emptyMessage={
              browser.starredView
                ? '暂无星标书签。在搜索结果中点击星形按钮，即可将常用书签显示在这里。'
                : browser.isSearchMode
                  ? '暂无匹配的书签'
                  : browser.randomView
                    ? '暂无书签可供随机查看'
                    : '暂无书签'
            }
            starPendingId={
              browser.starMutation.isPending ? (browser.starMutation.variables?.id ?? null) : null
            }
            onToggleStarred={(bookmark, starred) =>
              browser.starMutation.mutate({ id: bookmark.id, starred })
            }
            onPreviewBookmark={navigation.previewBookmarkFrom}
            onOpenBookmark={navigation.openBookmark}
            activeBookmarkId={navigation.activeBookmarkId}
            onActiveBookmarkChange={navigation.setActiveBookmarkId}
            onBookmarkElementChange={navigation.registerBookmarkElement}
            onInteractionLockChange={setResultListInteractionLocked}
          />
        </div>
      </main>
      <AddBookmarkDialog open={showAddDialog} onOpenChange={setShowAddDialog} />
      <BookmarkWebPreview
        bookmark={navigation.previewBookmark}
        open={navigation.previewBookmark !== null}
        onOpenChange={navigation.setPreviewOpen}
        container={previewContainer}
      />
    </div>
  );
}
