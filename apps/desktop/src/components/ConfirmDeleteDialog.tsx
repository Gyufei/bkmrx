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
import { getErrorMessage } from '@/lib/error';

interface ConfirmDeleteDialogProps {
  open: boolean;
  title: React.ReactNode;
  description: React.ReactNode;
  confirmLabel?: string;
  pending?: boolean;
  error?: unknown;
  errorPrefix?: string;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void | Promise<void>;
}

export default function ConfirmDeleteDialog({
  open,
  title,
  description,
  confirmLabel = '删除',
  pending = false,
  error,
  errorPrefix = '删除失败：',
  onOpenChange,
  onConfirm,
}: ConfirmDeleteDialogProps) {
  const errorMessage = error == null ? null : getErrorMessage(error);

  return (
    <AlertDialog open={open} onOpenChange={(nextOpen) => !pending && onOpenChange(nextOpen)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
          {errorMessage && (
            <p className="text-sm text-destructive">
              {errorPrefix}
              {errorMessage}
            </p>
          )}
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel render={<Button variant="outline" disabled={pending} />}>
            取消
          </AlertDialogCancel>
          <AlertDialogAction disabled={pending} onClick={onConfirm}>
            {confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
