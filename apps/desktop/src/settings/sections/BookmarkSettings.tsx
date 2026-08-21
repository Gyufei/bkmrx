import { useEffect, useState } from 'react';
import { open } from '@tauri-apps/plugin-dialog';
import { useMutation, useQueryClient } from '@tanstack/react-query';

import type { AppSettings } from '@/lib/invoke';

import BookmarkTransferCard from '../BookmarkTransferCard';
import EditableDirectoryField from '../EditableDirectoryField';
import { SettingsQueryApiKey, updateSettingsApi } from '../settings.api';
import { errorMessage } from '../settings.utils';

interface BookmarkSettingsProps {
  settings?: AppSettings;
  onDirtyChange: (dirty: boolean) => void;
}

export default function BookmarkSettings({ settings, onDirtyChange }: BookmarkSettingsProps) {
  const queryClient = useQueryClient();
  const [backupDir, setBackupDir] = useState('');
  const [editing, setEditing] = useState(false);
  const updateMutation = useMutation({
    mutationFn: updateSettingsApi,
    onSuccess: async () => {
      setEditing(false);
      onDirtyChange(false);
      await queryClient.invalidateQueries({ queryKey: [SettingsQueryApiKey.SETTINGS] });
    },
  });

  useEffect(() => {
    if (!editing) setBackupDir(settings?.bookmark.backup_dir ?? '');
  }, [editing, settings]);

  function changeBackupDir(value: string) {
    setBackupDir(value);
    onDirtyChange(value !== (settings?.bookmark.backup_dir ?? ''));
  }

  function cancelEdit() {
    updateMutation.reset();
    setBackupDir(settings?.bookmark.backup_dir ?? '');
    setEditing(false);
    onDirtyChange(false);
  }

  function saveBackupDir() {
    if (!settings || updateMutation.isPending) return;
    updateMutation.mutate({
      ...settings,
      bookmark: { ...settings.bookmark, backup_dir: backupDir.trim() || null },
    });
  }

  async function chooseDirectory() {
    const selected = await open({ multiple: false, directory: true });
    return typeof selected === 'string' ? selected : null;
  }

  return (
    <section aria-labelledby="bookmark-settings-title" className="flex flex-col gap-6">
      <div>
        <h1 id="bookmark-settings-title" className="text-xl font-semibold">
          书签
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">管理书签备份、导入和导出。</p>
      </div>
      <BookmarkTransferCard
        backupDirectory={backupDir}
        directoryField={
          <EditableDirectoryField
            label="默认备份目录"
            value={backupDir}
            placeholder="/Users/me/CloudDrive/bookmarks"
            editing={editing}
            editDisabled={!settings}
            saveDisabled={!settings}
            pending={updateMutation.isPending}
            error={updateMutation.isError ? errorMessage(updateMutation.error) : undefined}
            onChange={changeBackupDir}
            onBrowse={chooseDirectory}
            onEdit={() => {
              updateMutation.reset();
              setEditing(true);
            }}
            onSave={saveBackupDir}
            onCancel={cancelEdit}
          />
        }
      />
    </section>
  );
}
