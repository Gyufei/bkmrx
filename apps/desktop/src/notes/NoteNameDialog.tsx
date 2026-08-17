import { useEffect, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field';
import type { NoteFile } from '../types';

interface NoteNameDialogProps {
  open: boolean;
  note: NoteFile | null;
  pending: boolean;
  error: Error | null;
  onOpenChange: (open: boolean) => void;
  onSubmit: (name: string) => void;
}

export default function NoteNameDialog({
  open,
  note,
  pending,
  error,
  onOpenChange,
  onSubmit,
}: NoteNameDialogProps) {
  const [fileName, setFileName] = useState('');
  const [validationError, setValidationError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setFileName(note?.title ?? '');
    setValidationError(null);
  }, [note, open]);

  const handleSubmit = () => {
    const name = fileName.trim();
    if (!name) {
      setValidationError('请输入文件名');
      return;
    }
    setValidationError(null);
    onSubmit(name);
  };

  const displayedError = validationError ?? error?.message;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{note ? '重命名笔记' : '新建笔记'}</DialogTitle>
        </DialogHeader>
        <FieldGroup className="py-2">
          <Field data-invalid={Boolean(displayedError) || undefined}>
            <FieldLabel htmlFor="note-file-name" className="sr-only">
              文件名
            </FieldLabel>
            <Input
              id="note-file-name"
              type="text"
              value={fileName}
              onChange={(event) => {
                setFileName(event.target.value);
                setValidationError(null);
              }}
              onKeyDown={(event) => event.key === 'Enter' && handleSubmit()}
              placeholder="输入文件名（无需 .md）"
              aria-invalid={Boolean(displayedError)}
              autoFocus
            />
            {displayedError && (
              <Alert variant="destructive" className="mt-1.5 py-1.5 text-xs">
                <AlertDescription>{displayedError}</AlertDescription>
              </Alert>
            )}
          </Field>
        </FieldGroup>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button variant="default" size="sm" disabled={pending} onClick={handleSubmit}>
            {pending && <Spinner data-icon="inline-start" />}
            确定
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
