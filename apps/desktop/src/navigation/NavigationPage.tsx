import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { open as openExternal } from '@tauri-apps/plugin-shell';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import type { BookmarkId, NavigationCategoryId } from '@/identity';
import type { NavigationBookmark, NavigationCategory } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import ConfirmDeleteDialog from '@/components/ConfirmDeleteDialog';
import { toast } from '@/components/ui/toast';
import { getErrorMessage } from '@/lib/error';
import { invokeRecordBookmarkAccess } from '@/lib/invoke';
import BookmarkPickerDialog from './BookmarkPickerDialog';
import NavigationBookmarkCard from './NavigationBookmarkCard';
import {
  addNavigationBookmarksApi,
  createNavigationCategoryApi,
  deleteNavigationCategoryApi,
  invalidateNavigationCategories,
  listNavigationCategoriesApi,
  NAVIGATION_CATEGORIES_KEY,
  removeNavigationBookmarkApi,
  updateNavigationCategoryApi,
} from './navigation.api';

interface PlacementTarget {
  categoryId: NavigationCategoryId;
  bookmark: NavigationBookmark;
}

export default function NavigationPage() {
  const client = useQueryClient();
  const [name, setName] = useState('');
  const [editing, setEditing] = useState<NavigationCategory | null>(null);
  const [editName, setEditName] = useState('');
  const [deleting, setDeleting] = useState<NavigationCategory | null>(null);
  const [addingTo, setAddingTo] = useState<NavigationCategory | null>(null);
  const categories = useQuery({
    queryKey: NAVIGATION_CATEGORIES_KEY,
    queryFn: listNavigationCategoriesApi,
  });
  const refresh = () => invalidateNavigationCategories(client);
  const report = (error: unknown) =>
    toast.add({ type: 'error', title: getErrorMessage(error, '分类操作失败') });
  const create = useMutation({
    mutationFn: createNavigationCategoryApi,
    onSuccess: () => {
      setName('');
      void refresh();
    },
    onError: report,
  });
  const update = useMutation({
    mutationFn: ({ category, next }: { category: NavigationCategory; next: string }) =>
      updateNavigationCategoryApi(category.id, next),
    onSuccess: () => {
      setEditing(null);
      void refresh();
    },
    onError: report,
  });
  const removeCategory = useMutation({
    mutationFn: deleteNavigationCategoryApi,
    onSuccess: () => {
      setDeleting(null);
      void refresh();
    },
    onError: report,
  });
  const addBookmarks = useMutation({
    mutationFn: ({
      categoryId,
      bookmarkIds,
    }: {
      categoryId: NavigationCategoryId;
      bookmarkIds: BookmarkId[];
    }) => addNavigationBookmarksApi(categoryId, bookmarkIds),
    onSuccess: () => {
      setAddingTo(null);
      void refresh();
    },
    onError: report,
  });
  const removeBookmark = useMutation({
    mutationFn: ({ categoryId, bookmark }: PlacementTarget) =>
      removeNavigationBookmarkApi(categoryId, bookmark.id),
    onSuccess: (_, target) => {
      void refresh();
      const toastId = toast.add({
        type: 'success',
        title: '已从分类移除',
        description: target.bookmark.title,
        actionProps: {
          children: '撤销',
          onClick: () => {
            addBookmarks.mutate({
              categoryId: target.categoryId,
              bookmarkIds: [target.bookmark.id],
            });
            toast.close(toastId);
          },
        },
      });
    },
    onError: report,
  });

  const openBookmark = async (bookmark: NavigationBookmark) => {
    try {
      await openExternal(bookmark.url);
      void invokeRecordBookmarkAccess(bookmark.id).catch(() =>
        console.error('Failed to record bookmark access'),
      );
    } catch {
      toast.add({ type: 'error', title: '无法打开链接', description: bookmark.url });
    }
  };

  return (
    <main className="flex min-h-0 flex-1 flex-col overflow-hidden bg-background">
      <header className="flex gap-2 border-b p-4">
        <Input
          aria-label="分类名称"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="新建分类"
        />
        <Button disabled={!name.trim() || create.isPending} onClick={() => create.mutate(name)}>
          <Plus />
          新建分类
        </Button>
      </header>
      <div className="flex-1 overflow-y-auto p-5">
        {categories.isLoading ? (
          <p>正在加载导航分类…</p>
        ) : categories.isError ? (
          <p role="alert">加载导航分类失败</p>
        ) : categories.data?.length === 0 ? (
          <p className="text-muted-foreground">还没有导航分类，先创建一个常用分类吧。</p>
        ) : (
          <div className="space-y-6">
            {categories.data?.map((category) => (
              <section key={category.id} className="rounded-xl border p-4">
                <div className="flex items-center justify-between gap-3">
                  {editing?.id === category.id ? (
                    <Input
                      aria-label={`重命名 ${category.name}`}
                      value={editName}
                      onChange={(event) => setEditName(event.target.value)}
                    />
                  ) : (
                    <h2 className="font-semibold">{category.name}</h2>
                  )}
                  <div className="flex gap-1">
                    <Button variant="outline" size="sm" onClick={() => setAddingTo(category)}>
                      <Plus />
                      添加书签
                    </Button>
                    {editing?.id === category.id ? (
                      <Button
                        size="sm"
                        disabled={!editName.trim() || update.isPending}
                        onClick={() => update.mutate({ category, next: editName })}
                      >
                        保存
                      </Button>
                    ) : (
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`重命名 ${category.name}`}
                        onClick={() => {
                          setEditing(category);
                          setEditName(category.name);
                        }}
                      >
                        <Pencil />
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`删除 ${category.name}`}
                      onClick={() => setDeleting(category)}
                    >
                      <Trash2 />
                    </Button>
                  </div>
                </div>
                {category.bookmarks.length === 0 ? (
                  <p className="mt-3 text-sm text-muted-foreground">该分类暂无书签</p>
                ) : (
                  <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                    {category.bookmarks.map((bookmark) => (
                      <NavigationBookmarkCard
                        key={bookmark.placement_id}
                        bookmark={bookmark}
                        removing={
                          removeBookmark.isPending &&
                          removeBookmark.variables?.categoryId === category.id &&
                          removeBookmark.variables.bookmark.id === bookmark.id
                        }
                        onOpen={() => void openBookmark(bookmark)}
                        onRemove={() =>
                          removeBookmark.mutate({ categoryId: category.id, bookmark })
                        }
                      />
                    ))}
                  </div>
                )}
              </section>
            ))}
          </div>
        )}
      </div>
      <BookmarkPickerDialog
        categoryId={addingTo?.id ?? null}
        categoryName={addingTo?.name ?? ''}
        assigned={addingTo?.bookmarks ?? []}
        pending={addBookmarks.isPending}
        onOpenChange={(open) => !open && setAddingTo(null)}
        onAdd={(bookmarkIds) => {
          if (addingTo) addBookmarks.mutate({ categoryId: addingTo.id, bookmarkIds });
        }}
      />
      <ConfirmDeleteDialog
        open={deleting !== null}
        title="删除导航分类？"
        description="只会删除分类及其中的导航关联，不会删除任何书签。"
        pending={removeCategory.isPending}
        error={removeCategory.error}
        onOpenChange={(open) => !open && setDeleting(null)}
        onConfirm={() => {
          if (deleting) return removeCategory.mutateAsync(deleting.id);
        }}
      />
    </main>
  );
}
