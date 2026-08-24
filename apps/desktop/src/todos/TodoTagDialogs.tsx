import type { FormEvent } from 'react';
import ConfirmDeleteDialog from '@/components/ConfirmDeleteDialog';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import type { TodoTag } from '@/types';

interface TodoTagDialogsProps {
  renaming: TodoTag | null;
  renameValue: string;
  renamePending: boolean;
  deleting: TodoTag | null;
  deletePending: boolean;
  deleteError?: unknown;
  archiving: TodoTag | null;
  archivePending: boolean;
  archiveError?: unknown;
  onRenameValueChange: (value: string) => void;
  onCloseRename: () => void;
  onRename: () => Promise<void>;
  onCloseDelete: () => void;
  onDelete: () => Promise<void>;
  onCloseArchive: () => void;
  onArchive: () => Promise<void>;
}

export default function TodoTagDialogs({
  renaming,
  renameValue,
  renamePending,
  deleting,
  deletePending,
  deleteError,
  archiving,
  archivePending,
  archiveError,
  onRenameValueChange,
  onCloseRename,
  onRename,
  onCloseDelete,
  onDelete,
  onCloseArchive,
  onArchive,
}: TodoTagDialogsProps) {
  const submitRename = async (event: FormEvent) => {
    event.preventDefault();
    if (!renaming || !renameValue.trim()) return;
    await onRename();
  };

  return (
    <>
      <Dialog open={Boolean(renaming)} onOpenChange={(open) => !open && onCloseRename()}>
        <DialogContent>
          <form onSubmit={submitRename} className="grid gap-5">
            <DialogHeader>
              <DialogTitle>重命名标签</DialogTitle>
            </DialogHeader>
            <Input
              value={renameValue}
              onChange={(event) => onRenameValueChange(event.target.value)}
              autoFocus
            />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={onCloseRename}>
                取消
              </Button>
              <Button type="submit" disabled={!renameValue.trim() || renamePending}>
                保存
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDeleteDialog
        open={Boolean(deleting)}
        title={`删除标签“${deleting?.name}”？`}
        description="只会删除标签及其任务关联，不会删除任何任务。"
        confirmLabel="删除标签"
        pending={deletePending}
        error={deleteError}
        onOpenChange={(open) => !open && onCloseDelete()}
        onConfirm={onDelete}
      />

      <ConfirmDeleteDialog
        open={Boolean(archiving)}
        title={`归档删除标签“${archiving?.name}”？`}
        description="将删除该标签及其下所有待办任务，此操作不可撤销。"
        confirmLabel="归档删除"
        errorPrefix="归档删除失败："
        pending={archivePending}
        error={archiveError}
        onOpenChange={(open) => !open && onCloseArchive()}
        onConfirm={onArchive}
      />
    </>
  );
}
