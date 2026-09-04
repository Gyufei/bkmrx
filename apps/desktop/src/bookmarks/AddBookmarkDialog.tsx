import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  addBookmarkApi,
  BkQueryApiKey,
  getTagsApi,
  invalidateNonRandomBookmarkQueries,
  tagQueryKey,
} from './bookmarks.api';
import BookmarkForm, { type BookmarkFormValues } from './BookmarkForm';
import type { Bookmark } from '@/types';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialValues?: BookmarkFormValues;
  onCreated?: (bookmark: Bookmark) => void;
  onCreateError?: (error: unknown, values: BookmarkFormValues) => void;
}

const EMPTY_VALUES: BookmarkFormValues = { url: '', title: '', tags: [], description: '' };

export default function AddBookmarkDialog({
  open,
  onOpenChange,
  initialValues = EMPTY_VALUES,
  onCreated,
  onCreateError,
}: Props) {
  const queryClient = useQueryClient();
  const { data: availableTags = [] } = useQuery({
    queryKey: tagQueryKey('', null),
    queryFn: () => getTagsApi({ query: '', limit: null }),
    enabled: open,
  });

  const {
    mutate: handleAdd,
    isPending: isAdding,
    error: addError,
    reset,
  } = useMutation({
    mutationFn: addBookmarkApi,
    onSuccess: (bookmark) => {
      onOpenChange(false);
      void invalidateNonRandomBookmarkQueries(queryClient);
      queryClient.invalidateQueries({ queryKey: [BkQueryApiKey.TAGS] });
      onCreated?.(bookmark);
    },
    onError: (error, values) => onCreateError?.(error, values),
  });

  useEffect(() => {
    if (open) reset();
  }, [open, reset]);

  function handleSubmit(values: BookmarkFormValues) {
    handleAdd(values);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!isAdding) onOpenChange(v);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>添加书签</DialogTitle>
          <DialogDescription>填写书签信息，保存后即可随时查看。</DialogDescription>
        </DialogHeader>
        <BookmarkForm
          key={open ? 'open' : 'closed'}
          idPrefix="add-bookmark"
          initialValues={initialValues}
          submitLabel="添加"
          pendingLabel="添加中..."
          errorMessage={addError ? `添加失败：${addError.message}` : undefined}
          isPending={isAdding}
          tagSuggestions={availableTags.map((tag) => tag.name)}
          onCancel={() => onOpenChange(false)}
          onSubmit={handleSubmit}
        />
      </DialogContent>
    </Dialog>
  );
}
