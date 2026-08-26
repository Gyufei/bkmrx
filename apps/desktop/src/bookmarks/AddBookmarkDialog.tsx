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

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function AddBookmarkDialog({ open, onOpenChange }: Props) {
  const queryClient = useQueryClient();
  const { data: availableTags = [] } = useQuery({
    queryKey: tagQueryKey('', null),
    queryFn: () => getTagsApi({ query: '', limit: null }),
  });

  const {
    mutate: handleAdd,
    isPending: isAdding,
    error: addError,
    reset,
  } = useMutation({
    mutationFn: addBookmarkApi,
    onSuccess: () => {
      onOpenChange(false);
      void invalidateNonRandomBookmarkQueries(queryClient);
      queryClient.invalidateQueries({ queryKey: [BkQueryApiKey.TAGS] });
    },
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
          <DialogDescription>输入书签信息并保存到本机 SQLite 数据库。</DialogDescription>
        </DialogHeader>
        <BookmarkForm
          idPrefix="add-bookmark"
          initialValues={{ url: '', title: '', tags: [], description: '' }}
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
