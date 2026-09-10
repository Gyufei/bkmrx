import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { BookmarkId, NavigationCategoryId } from '@/identity';
import type { Bookmark } from '@/types';
import { toast } from '@/components/ui/toast';
import { getErrorMessage } from '@/lib/error';
import {
  addNavigationBookmarksApi,
  invalidateNavigationSections,
  listNavigationSectionsApi,
  NAVIGATION_SECTIONS_KEY,
} from '@/navigation/navigation.api';

interface AddTarget {
  categoryId: NavigationCategoryId;
  bookmarkId: BookmarkId;
}

export function useAddBookmarkToNavigation(bookmark: Bookmark | null, onComplete: () => void) {
  const client = useQueryClient();
  const [selectedId, setSelectedId] = useState<NavigationCategoryId | null>(null);
  const [error, setError] = useState<string | null>(null);
  const sections = useQuery({
    queryKey: NAVIGATION_SECTIONS_KEY,
    queryFn: listNavigationSectionsApi,
    enabled: bookmark !== null,
  });
  const add = useMutation({
    mutationFn: ({ categoryId, bookmarkId }: AddTarget) =>
      addNavigationBookmarksApi(categoryId, [bookmarkId]),
  });
  useEffect(() => {
    setSelectedId(null);
    setError(null);
  }, [bookmark]);
  const select = (id: NavigationCategoryId) => {
    setSelectedId(id);
    setError(null);
  };
  const submit = () =>
    submitSelection({
      bookmark,
      selectedId,
      sections: sections.data,
      add: add.mutateAsync,
      refresh: () => invalidateNavigationSections(client),
      onComplete,
      setError,
    });
  return { sections, selectedId, error, pending: add.isPending, select, submit };
}

type Sections = Awaited<ReturnType<typeof listNavigationSectionsApi>>;

async function submitSelection(input: {
  bookmark: Bookmark | null;
  selectedId: NavigationCategoryId | null;
  sections?: Sections;
  add(target: AddTarget): Promise<unknown>;
  refresh(): Promise<void>;
  onComplete(): void;
  setError(message: string): void;
}) {
  const { bookmark, selectedId } = input;
  if (!bookmark || !selectedId) return;
  const selected = input.sections?.find((section) => section.category.id === selectedId);
  if (selected?.cards.some((card) => card.bookmark_id === bookmark.id)) {
    input.setError(`“${bookmark.title || bookmark.url}”已在“${selected.category.name}”分类中`);
    return;
  }
  try {
    await input.add({ categoryId: selectedId, bookmarkId: bookmark.id });
    await input.refresh();
    toast.add({ type: 'success', title: '已添加到导航分类', description: selected?.category.name });
    input.onComplete();
  } catch (cause) {
    input.setError(getErrorMessage(cause, '添加到导航分类失败'));
  }
}
