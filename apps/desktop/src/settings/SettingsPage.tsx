import { useCallback, useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type { AppSettings } from '@/lib/invoke';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

import BookmarkTransferCard from './BookmarkTransferCard';
import EditableDirectoryField from './EditableDirectoryField';
import {
  getSettingsApi,
  getSystemInfoApi,
  SettingsQueryApiKey,
  updateSettingsApi,
} from './settings.api';
import SystemInfoCard from './SystemInfoCard';

type EditablePath = 'backup' | 'notes';

function SettingsPage() {
  const queryClient = useQueryClient();
  const [backupDir, setBackupDir] = useState('');
  const [notesDir, setNotesDir] = useState('');
  const [editingPath, setEditingPath] = useState<EditablePath | null>(null);

  const { data: settings } = useQuery({
    queryKey: [SettingsQueryApiKey.SETTINGS],
    queryFn: getSettingsApi,
  });
  const { data: sysInfo } = useQuery({
    queryKey: [SettingsQueryApiKey.SYSTEM_INFO],
    queryFn: getSystemInfoApi,
  });
  const updateMutation = useMutation({
    mutationFn: updateSettingsApi,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [SettingsQueryApiKey.SETTINGS] });
    },
  });

  useEffect(() => {
    setBackupDir(settings?.backup_dir ?? '');
    setNotesDir(settings?.notes_dir ?? '');
  }, [settings]);

  const handleCopy = useCallback(async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // Clipboard access is optional.
    }
  }, []);

  function saveDirectory() {
    if (!settings || updateMutation.isPending) return;
    updateMutation.mutate(currentSettings(backupDir, notesDir), {
      onSuccess: () => setEditingPath(null),
    });
  }

  function startPathEdit(path: EditablePath) {
    updateMutation.reset();
    setEditingPath(path);
  }

  function cancelPathEdit() {
    updateMutation.reset();
    setBackupDir(settings?.backup_dir ?? '');
    setNotesDir(settings?.notes_dir ?? '');
    setEditingPath(null);
  }

  const directoryFieldProps = {
    editDisabled: editingPath !== null || !settings,
    saveDisabled: !settings,
    pending: updateMutation.isPending,
    error: updateMutation.isError ? errorMessage(updateMutation.error) : undefined,
    onSave: saveDirectory,
    onCancel: cancelPathEdit,
  };

  return (
    <div className="thin-scrollbar flex-1 overflow-y-auto">
      <div className="mx-auto flex max-w-xl flex-col gap-8 px-6 py-8">
        <SystemInfoCard info={sysInfo} onCopy={handleCopy} />
        <BookmarkTransferCard
          backupDirectory={backupDir}
          directoryField={
            <EditableDirectoryField
              {...directoryFieldProps}
              label="默认备份目录"
              value={backupDir}
              placeholder="/Users/me/CloudDrive/bookmarks"
              editing={editingPath === 'backup'}
              onChange={setBackupDir}
              onEdit={() => startPathEdit('backup')}
            />
          }
        />
        <Card>
          <CardHeader>
            <CardTitle>笔记目录</CardTitle>
          </CardHeader>
          <CardContent>
            <EditableDirectoryField
              {...directoryFieldProps}
              label="Obsidian vault 路径"
              value={notesDir}
              placeholder="输入 Obsidian 笔记目录路径"
              editing={editingPath === 'notes'}
              onChange={setNotesDir}
              onEdit={() => startPathEdit('notes')}
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function currentSettings(backupDir: string, notesDir: string): AppSettings {
  return {
    backup_dir: backupDir.trim() || null,
    notes_dir: notesDir.trim() || null,
  };
}

function errorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === 'object' && error && 'message' in error) return String(error.message);
  return '操作失败';
}

export default SettingsPage;
