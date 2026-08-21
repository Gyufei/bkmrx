import { useEffect, useState } from 'react';
import { open } from '@tauri-apps/plugin-dialog';
import { useMutation, useQueryClient } from '@tanstack/react-query';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { AppSettings } from '@/lib/invoke';

import EditableDirectoryField from '../EditableDirectoryField';
import { SettingsQueryApiKey, updateSettingsApi } from '../settings.api';
import { errorMessage } from '../settings.utils';

interface NoteSettingsProps {
  settings?: AppSettings;
  onDirtyChange: (dirty: boolean) => void;
}

export default function NoteSettings({ settings, onDirtyChange }: NoteSettingsProps) {
  const queryClient = useQueryClient();
  const [notesDir, setNotesDir] = useState('');
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
    if (!editing) setNotesDir(settings?.note.notes_dir ?? '');
  }, [editing, settings]);

  function changeNotesDir(value: string) {
    setNotesDir(value);
    onDirtyChange(value !== (settings?.note.notes_dir ?? ''));
  }

  function cancelEdit() {
    updateMutation.reset();
    setNotesDir(settings?.note.notes_dir ?? '');
    setEditing(false);
    onDirtyChange(false);
  }

  function saveNotesDir() {
    if (!settings || updateMutation.isPending) return;
    updateMutation.mutate({
      ...settings,
      note: { ...settings.note, notes_dir: notesDir.trim() || null },
    });
  }

  async function chooseDirectory() {
    const selected = await open({ multiple: false, directory: true });
    return typeof selected === 'string' ? selected : null;
  }

  return (
    <section aria-labelledby="note-settings-title" className="flex flex-col gap-6">
      <div>
        <h1 id="note-settings-title" className="text-xl font-semibold">
          笔记
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">设置 Obsidian 笔记库所在目录。</p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>笔记目录</CardTitle>
        </CardHeader>
        <CardContent>
          <EditableDirectoryField
            label="Obsidian vault 路径"
            value={notesDir}
            placeholder="输入 Obsidian 笔记目录路径"
            editing={editing}
            editDisabled={!settings}
            saveDisabled={!settings}
            pending={updateMutation.isPending}
            error={updateMutation.isError ? errorMessage(updateMutation.error) : undefined}
            onChange={changeNotesDir}
            onBrowse={chooseDirectory}
            onEdit={() => {
              updateMutation.reset();
              setEditing(true);
            }}
            onSave={saveNotesDir}
            onCancel={cancelEdit}
          />
        </CardContent>
      </Card>
    </section>
  );
}
