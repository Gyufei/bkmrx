import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import type { Bookmark } from '../types';
import {
  BkQueryApiKey,
  getTagsApi,
  invalidateNonRandomBookmarkQueries,
  tagQueryKey,
  updateBookmarkApi,
  updateRandomBookmarkQuery,
} from './bookmarks.api';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import BookmarkForm, { type BookmarkFormValues } from './BookmarkForm';

interface Props {
  editTarget: Bookmark | null;
  setEditTarget: (bookmark: Bookmark | null) => void;
}

export default function EditBookmarkDialog({ editTarget, setEditTarget }: Props) {
  const queryClient = useQueryClient();
  const { data: availableTags = [] } = useQuery({
    queryKey: tagQueryKey('', null),
    queryFn: () => getTagsApi({ query: '', limit: null }),
  });

  const {
    mutate: handleUpdate,
    isPending: isUpdating,
    error: updateError,
  } = useMutation({
    mutationFn: updateBookmarkApi,
    onSuccess: (updatedBookmark) => {
      setEditTarget(null);
      updateRandomBookmarkQuery(queryClient, updatedBookmark);
      void invalidateNonRandomBookmarkQueries(queryClient);
      queryClient.invalidateQueries({ queryKey: [BkQueryApiKey.TAGS] });
    },
  });

  function handleSubmit(values: BookmarkFormValues) {
    if (!editTarget) return;

    handleUpdate({
      id: editTarget.id,
      input: values,
    });
  }

  return (
    <Dialog
      open={editTarget !== null}
      onOpenChange={(open) => {
        if (!open && !isUpdating) setEditTarget(null);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>编辑书签</DialogTitle>
          <DialogDescription>修改 URL、标题、标签或描述。</DialogDescription>
        </DialogHeader>
        {editTarget && (
          <BookmarkForm
            key={editTarget.id}
            idPrefix="edit-bookmark"
            initialValues={{
              url: editTarget.url,
              title: editTarget.title || '',
              tags: editTarget.tags,
              description: editTarget.description || '',
            }}
            submitLabel="保存"
            pendingLabel="保存中..."
            errorMessage={updateError ? `更新失败：${updateError.message}` : undefined}
            isPending={isUpdating}
            tagSuggestions={availableTags.map((tag) => tag.name)}
            onCancel={() => setEditTarget(null)}
            onSubmit={handleSubmit}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
