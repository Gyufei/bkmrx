import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { AppSettings } from '@/lib/invoke';

import BookmarkTransferCard from '../BookmarkTransferCard';
import DirectorySettingRow from '../DirectorySettingRow';
import { SettingsQueryApiKey, updateSettingsApi } from '../settings.api';

interface GeneralSettingsProps {
  settings?: AppSettings;
  onDirtyChange: (dirty: boolean) => void;
}

export default function GeneralSettings({ settings, onDirtyChange }: GeneralSettingsProps) {
  const queryClient = useQueryClient();
  const [dirtyRows, setDirtyRows] = useState<Set<string>>(new Set());

  useEffect(() => {
    onDirtyChange(dirtyRows.size > 0);
  }, [dirtyRows, onDirtyChange]);

  const setRowDirty = (key: string, dirty: boolean) => {
    setDirtyRows((current) => {
      const next = new Set(current);
      if (dirty) next.add(key);
      else next.delete(key);
      return next;
    });
  };

  const savePath = async (key: keyof AppSettings['common']['paths'], value: string | null) => {
    if (!settings) return;
    await updateSettingsApi({
      ...settings,
      common: { paths: { ...settings.common.paths, [key]: value } },
    });
    await queryClient.invalidateQueries({ queryKey: [SettingsQueryApiKey.SETTINGS] });
  };

  const paths = settings?.common.paths;
  return (
    <section aria-labelledby="general-settings-title" className="flex flex-col gap-6">
      <div>
        <h1 id="general-settings-title" className="text-xl font-semibold">
          通用
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">管理本机路径与通用数据操作。</p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>路径配置</CardTitle>
        </CardHeader>
        <CardContent>
          <DirectorySettingRow
            label="书签导出目录"
            value={paths?.bookmark_export_dir}
            placeholder="选择书签默认导出目录"
            disabled={!settings}
            onDirtyChange={(dirty) => setRowDirty('bookmark', dirty)}
            onSave={(value) => savePath('bookmark_export_dir', value)}
          />
          <DirectorySettingRow
            label="Todo 导出目录"
            value={paths?.todo_export_dir}
            placeholder="选择 Todo 默认导出目录"
            disabled={!settings}
            onDirtyChange={(dirty) => setRowDirty('todo', dirty)}
            onSave={(value) => savePath('todo_export_dir', value)}
          />
          <DirectorySettingRow
            label="Obsidian 笔记"
            value={paths?.notes_dir}
            placeholder="选择 Obsidian 笔记目录"
            disabled={!settings}
            onDirtyChange={(dirty) => setRowDirty('notes', dirty)}
            onSave={(value) => savePath('notes_dir', value)}
          />
        </CardContent>
      </Card>
      <BookmarkTransferCard backupDirectory={paths?.bookmark_export_dir ?? ''} />
    </section>
  );
}
