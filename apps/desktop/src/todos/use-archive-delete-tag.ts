import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { toast } from '@/components/ui/toast';
import type { Todo, TodoTag } from '@/types';
import { archiveDeleteTodoTagApi } from './todos.api';

interface Options {
  items?: Todo[];
  invalidate: () => Promise<void>;
  onDeleted: (id: number) => void;
}

export function useArchiveDeleteTag({ items, invalidate, onDeleted }: Options) {
  const [archivingTag, setArchivingTag] = useState<TodoTag | null>(null);
  const mutation = useMutation({
    mutationFn: (id: number) => archiveDeleteTodoTagApi(id),
    onSuccess: async (_result, deletedId) => {
      onDeleted(deletedId);
      await invalidate();
    },
  });

  const prepareArchive = (tag: TodoTag) => {
    const normalizedName = tag.name.toLowerCase();
    const hasActive = items?.some(
      (item) =>
        item.status === 'in_progress' &&
        item.tags.some((name) => name.toLowerCase() === normalizedName),
    );
    if (hasActive) {
      toast.add({ title: '当前标签存在未完成待办，无法归档删除。', type: 'error' });
      return;
    }
    mutation.reset();
    setArchivingTag(tag);
  };

  const archive = async () => {
    if (!archivingTag) return;
    try {
      await mutation.mutateAsync(archivingTag.id);
      setArchivingTag(null);
    } catch {
      // Keep the dialog open so it can render the structured backend error.
    }
  };

  return {
    archivingTag,
    archivePending: mutation.isPending,
    archiveError: mutation.error,
    prepareArchive,
    closeArchive: () => setArchivingTag(null),
    archive,
  };
}
