import { useEffect, useState, type KeyboardEvent } from 'react';
import { open } from '@tauri-apps/plugin-dialog';
import { Check, FolderOpen, Pencil, X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { getErrorMessage } from '@/lib/error';
import { formatPathForDisplay } from '@/lib/path';

interface DirectorySettingRowProps {
  label: string;
  value: string | null | undefined;
  placeholder: string;
  disabled?: boolean;
  onDirtyChange: (dirty: boolean) => void;
  onSave: (value: string | null) => Promise<void>;
}

export default function DirectorySettingRow({
  label,
  value,
  placeholder,
  disabled = false,
  onDirtyChange,
  onSave,
}: DirectorySettingRowProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? '');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<unknown>();

  useEffect(() => {
    if (!editing) setDraft(value ?? '');
  }, [editing, value]);

  const updateDraft = (next: string) => {
    setDraft(next);
    onDirtyChange(next.trim() !== (value ?? ''));
  };

  const cancel = () => {
    setDraft(value ?? '');
    setError(undefined);
    setEditing(false);
    onDirtyChange(false);
  };

  const save = async () => {
    if (pending) return;
    setPending(true);
    setError(undefined);
    try {
      await onSave(draft.trim() || null);
      setEditing(false);
      onDirtyChange(false);
    } catch (nextError) {
      setError(nextError);
    } finally {
      setPending(false);
    }
  };

  const browse = async () => {
    const selected = await open({ multiple: false, directory: true });
    if (typeof selected === 'string') updateDraft(selected);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      void save();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      cancel();
    }
  };

  return (
    <div className="grid gap-2 border-b py-4 last:border-b-0 sm:grid-cols-[9rem_minmax(0,1fr)_auto] sm:items-center">
      <label htmlFor={`directory-${label}`} className="text-sm font-medium">
        {label}
      </label>
      {editing ? (
        <div className="min-w-0">
          <div className="flex min-w-0 gap-2">
            <Input
              id={`directory-${label}`}
              value={draft}
              placeholder={placeholder}
              disabled={pending}
              aria-invalid={Boolean(error)}
              onChange={(event) => updateDraft(event.target.value)}
              onKeyDown={handleKeyDown}
              autoFocus
            />
            <Button
              type="button"
              variant="outline"
              size="icon"
              aria-label={`浏览${label}`}
              disabled={pending}
              onClick={browse}
            >
              <FolderOpen />
            </Button>
          </div>
          {Boolean(error) && (
            <p className="mt-1.5 text-xs text-destructive">保存失败：{getErrorMessage(error)}</p>
          )}
        </div>
      ) : (
        <p className="min-w-0 truncate text-sm text-muted-foreground" title={value ?? undefined}>
          {value ? formatPathForDisplay(value) : '未设置'}
        </p>
      )}
      <div className="flex justify-end gap-1.5">
        {editing ? (
          <>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={`取消编辑${label}`}
              disabled={pending}
              onClick={cancel}
            >
              <X />
            </Button>
            <Button
              type="button"
              size="icon"
              aria-label={`保存${label}`}
              disabled={pending}
              onClick={save}
            >
              <Check />
            </Button>
          </>
        ) : (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={`编辑${label}`}
            disabled={disabled}
            onClick={() => {
              setError(undefined);
              setEditing(true);
            }}
          >
            <Pencil />
          </Button>
        )}
      </div>
    </div>
  );
}
