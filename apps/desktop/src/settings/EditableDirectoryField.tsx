import { useId, type KeyboardEvent } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Spinner } from '@/components/ui/spinner';
import { Field, FieldLabel } from '@/components/ui/field';

interface EditableDirectoryFieldProps {
  label: string;
  value: string;
  placeholder: string;
  editing: boolean;
  editDisabled: boolean;
  saveDisabled: boolean;
  pending: boolean;
  error?: string;
  onChange: (value: string) => void;
  onEdit: () => void;
  onSave: () => void;
  onCancel: () => void;
}

export default function EditableDirectoryField({
  label,
  value,
  placeholder,
  editing,
  editDisabled,
  saveDisabled,
  pending,
  error,
  onChange,
  onEdit,
  onSave,
  onCancel,
}: EditableDirectoryFieldProps) {
  const inputId = useId();

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Enter') {
      event.preventDefault();
      onSave();
    }
    if (event.key === 'Escape' && !pending) {
      event.preventDefault();
      onCancel();
    }
  }

  return (
    <Field data-invalid={Boolean(error) || undefined}>
      <FieldLabel htmlFor={editing ? inputId : undefined} className="text-xs text-muted-foreground">
        {label}
      </FieldLabel>
      {editing ? (
        <div className="flex flex-col gap-2">
          <Input
            id={inputId}
            autoFocus
            value={value}
            onChange={(event) => onChange(event.target.value)}
            placeholder={placeholder}
            onKeyDown={handleKeyDown}
            aria-invalid={Boolean(error)}
            disabled={pending}
          />
          <div className="flex gap-2">
            <Button size="sm" onClick={onSave} disabled={pending || saveDisabled}>
              {pending && <Spinner data-icon="inline-start" />}
              {pending ? '保存中...' : '保存'}
            </Button>
            <Button size="sm" variant="outline" onClick={onCancel} disabled={pending}>
              取消
            </Button>
          </div>
          {error && (
            <Alert variant="destructive" className="py-1.5 text-xs">
              <AlertDescription>保存失败：{error}</AlertDescription>
            </Alert>
          )}
        </div>
      ) : (
        <div className="flex items-start gap-3">
          <p
            className={cn(
              'min-w-0 flex-1 select-text break-all text-sm',
              value ? 'text-foreground' : 'text-muted-foreground',
            )}
          >
            {value || '未配置'}
          </p>
          <Button
            size="sm"
            variant="outline"
            className="shrink-0"
            onClick={onEdit}
            disabled={editDisabled || pending}
          >
            编辑
          </Button>
        </div>
      )}
    </Field>
  );
}
