import { useEffect } from 'react';
import type { Bookmark } from '../types';
import ConfirmDeleteDialog from '@/components/ConfirmDeleteDialog';
import {
  deleteBookmarksApi,
  BkQueryApiKey,
  invalidateNonRandomBookmarkQueries,
  removeRandomBookmarksFromQuery,
} from './bookmarks.api';
import { useMutation, useQueryClient } from '@tanstack/react-query';

export default function DeleteBkDialog({
  deleteTarget,
  setDeleteTarget,
}: {
  deleteTarget: Bookmark | null;
  setDeleteTarget: (bookmark: Bookmark | null) => void;
}) {
  const queryClient = useQueryClient();

  const {
    mutate: handleDelete,
    isPending: isDeleting,
    error: deleteError,
    reset,
  } = useMutation({
    mutationFn: deleteBookmarksApi,
    onSuccess: (_, ids) => {
      setDeleteTarget(null);
      removeRandomBookmarksFromQuery(queryClient, ids);
      void invalidateNonRandomBookmarkQueries(queryClient);
      queryClient.invalidateQueries({ queryKey: [BkQueryApiKey.TAGS] });
    },
  });

  useEffect(() => {
    if (deleteTarget) reset();
  }, [deleteTarget, reset]);

  return (
    <ConfirmDeleteDialog
      open={deleteTarget !== null}
      title="确认删除"
      description={`确定要删除书签“${deleteTarget?.title || deleteTarget?.url}”吗？此操作不可撤销。`}
      pending={isDeleting}
      error={deleteError}
      onOpenChange={(open) => !open && setDeleteTarget(null)}
      onConfirm={() => {
        if (deleteTarget) handleDelete([deleteTarget.id]);
      }}
    />
  );
}
