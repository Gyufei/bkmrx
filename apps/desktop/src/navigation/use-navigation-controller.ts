import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { BookmarkId, NavigationCategoryId } from '@/identity';
import type { NavigationPlacementCard } from '@/types';
import { toast } from '@/components/ui/toast';
import { getErrorMessage } from '@/lib/error';
import { openBookmark } from '@/bookmarks/open-bookmark';
import {
  addNavigationBookmarksApi,
  createNavigationCategoryApi,
  deleteNavigationCategoryApi,
  invalidateNavigationSections,
  listNavigationSectionsApi,
  NAVIGATION_SECTIONS_KEY,
  removeNavigationBookmarkApi,
  updateNavigationCategoryApi,
} from './navigation.api';

export interface PlacementTarget {
  categoryId: NavigationCategoryId;
  card: NavigationPlacementCard;
}

function report(error: unknown) {
  toast.add({ type: 'error', title: getErrorMessage(error, '分类操作失败') });
}

export function useNavigationController() {
  const client = useQueryClient();
  const refresh = () => invalidateNavigationSections(client);
  const sections = useQuery({
    queryKey: NAVIGATION_SECTIONS_KEY,
    queryFn: listNavigationSectionsApi,
  });
  const create = useMutation({
    mutationFn: createNavigationCategoryApi,
    onSuccess: refresh,
    onError: report,
  });
  const rename = useMutation({
    mutationFn: ({ id, name }: { id: NavigationCategoryId; name: string }) =>
      updateNavigationCategoryApi(id, name),
    onSuccess: refresh,
    onError: report,
  });
  const removeCategory = useMutation({
    mutationFn: deleteNavigationCategoryApi,
    onSuccess: refresh,
    onError: report,
  });
  const addCards = useMutation({
    mutationFn: ({
      categoryId,
      bookmarkIds,
    }: {
      categoryId: NavigationCategoryId;
      bookmarkIds: BookmarkId[];
    }) => addNavigationBookmarksApi(categoryId, bookmarkIds),
    onSuccess: refresh,
    onError: report,
  });
  const removeCard = useRemoveCard(refresh, addCards.mutate);
  return { sections, create, rename, removeCategory, addCards, removeCard, open: openCard };
}

function useRemoveCard(
  refresh: () => Promise<void>,
  restore: (target: { categoryId: NavigationCategoryId; bookmarkIds: BookmarkId[] }) => void,
) {
  return useMutation({
    mutationFn: ({ categoryId, card }: PlacementTarget) =>
      removeNavigationBookmarkApi(categoryId, card.bookmark_id),
    onSuccess: (_, target) => {
      void refresh();
      const toastId = toast.add({
        type: 'success',
        title: '已从分类移除',
        description: target.card.title,
        actionProps: { children: '撤销', onClick: () => undoRemoval(target, restore, toastId) },
      });
    },
    onError: report,
  });
}

function undoRemoval(
  target: PlacementTarget,
  restore: (value: { categoryId: NavigationCategoryId; bookmarkIds: BookmarkId[] }) => void,
  toastId: string,
) {
  restore({ categoryId: target.categoryId, bookmarkIds: [target.card.bookmark_id] });
  toast.close(toastId);
}

async function openCard(card: NavigationPlacementCard) {
  try {
    await openBookmark({ id: card.bookmark_id, url: card.url });
  } catch {
    toast.add({ type: 'error', title: '无法打开链接', description: card.url });
  }
}
