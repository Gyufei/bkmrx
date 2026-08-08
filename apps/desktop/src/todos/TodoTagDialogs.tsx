import type { FormEvent } from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
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
  onRenameValueChange: (value: string) => void;
  onCloseRename: () => void;
  onRename: () => Promise<void>;
  onCloseDelete: () => void;
  onDelete: () => Promise<void>;
}

export default function TodoTagDialogs({
  renaming,
  renameValue,
  renamePending,
  deleting,
  deletePending,
  onRenameValueChange,
  onCloseRename,
  onRename,
  onCloseDelete,
  onDelete,
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

      <AlertDialog open={Boolean(deleting)} onOpenChange={(open) => !open && onCloseDelete()}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>删除标签“{deleting?.name}”？</AlertDialogTitle>
            <AlertDialogDescription>
              只会删除标签及其任务关联，不会删除任何任务。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel render={<Button variant="outline" />}>取消</AlertDialogCancel>
            <AlertDialogAction disabled={deletePending} onClick={onDelete}>
              删除标签
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
