import { useEffect, useState } from 'react';
import type { NavigationCategory } from '@/types';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';

interface Props {
  open: boolean;
  category: NavigationCategory | null;
  pending: boolean;
  onOpenChange(open: boolean): void;
  onSubmit(name: string): Promise<unknown>;
}

export default function NavigationCategoryDialog({
  open,
  category,
  pending,
  onOpenChange,
  onSubmit,
}: Props) {
  const [name, setName] = useState('');
  useEffect(() => {
    if (!open) return;
    setName(category?.name ?? '');
  }, [category, open]);

  const submit = async () => {
    const next = name.trim();
    if (!next || pending) return;
    try {
      await onSubmit(next);
    } catch {
      // The controller reports mutation errors and the dialog remains open for retry.
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{category ? '编辑分类' : '新建分类'}</DialogTitle>
        </DialogHeader>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="navigation-category-name">分类名称</FieldLabel>
            <Input
              id="navigation-category-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key !== 'Enter' || event.repeat || event.nativeEvent.isComposing) return;
                event.preventDefault();
                void submit();
              }}
              autoFocus
            />
          </Field>
        </FieldGroup>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button disabled={!name.trim() || pending} onClick={() => void submit()}>
            {pending && <Spinner data-icon="inline-start" />}
            确定
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
