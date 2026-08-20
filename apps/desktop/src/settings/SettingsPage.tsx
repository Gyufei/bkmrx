import { useCallback, useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type { AppSettings } from '@/lib/invoke';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Field, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Eye, EyeOff } from 'lucide-react';

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
  const [rsshubBaseUrl, setRsshubBaseUrl] = useState('');
  const [rsshubAccessKey, setRsshubAccessKey] = useState('');
  const [editingPath, setEditingPath] = useState<EditablePath | null>(null);
  const [editingRss, setEditingRss] = useState(false);
  const [showRsshubAccessKey, setShowRsshubAccessKey] = useState(false);

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
    setBackupDir(settings?.bookmark.backup_dir ?? '');
    setNotesDir(settings?.note.notes_dir ?? '');
    setRsshubBaseUrl(settings?.rss.rsshub_base_url ?? '');
    setRsshubAccessKey(settings?.rss.rsshub_access_key ?? '');
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
    updateMutation.mutate(currentSettings(backupDir, notesDir, rsshubBaseUrl, rsshubAccessKey), {
      onSuccess: () => setEditingPath(null),
    });
  }

  function startPathEdit(path: EditablePath) {
    updateMutation.reset();
    setEditingPath(path);
  }

  function cancelPathEdit() {
    updateMutation.reset();
    setBackupDir(settings?.bookmark.backup_dir ?? '');
    setNotesDir(settings?.note.notes_dir ?? '');
    setEditingPath(null);
  }

  const directoryFieldProps = {
    editDisabled: editingPath !== null || editingRss || !settings,
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
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>RSS</CardTitle>
            {!editingRss && (
              <Button
                size="sm"
                variant="outline"
                aria-label="编辑 RSS 设置"
                disabled={editingPath !== null || !settings}
                onClick={() => {
                  updateMutation.reset();
                  setEditingRss(true);
                }}
              >
                编辑
              </Button>
            )}
          </CardHeader>
          <CardContent>
            {editingRss ? (
              <form
                className="flex flex-col gap-4"
                onSubmit={(event) => {
                  event.preventDefault();
                  if (!settings || updateMutation.isPending) return;
                  updateMutation.mutate(
                    currentSettings(backupDir, notesDir, rsshubBaseUrl, rsshubAccessKey),
                    {
                      onSuccess: () => {
                        setEditingRss(false);
                        setShowRsshubAccessKey(false);
                      },
                    },
                  );
                }}
              >
                <Field>
                  <FieldLabel htmlFor="rsshub-base-url">RSSHub 服务地址</FieldLabel>
                  <Input
                    id="rsshub-base-url"
                    type="url"
                    value={rsshubBaseUrl}
                    onChange={(event) => setRsshubBaseUrl(event.target.value)}
                    placeholder="https://rss.example.com"
                    disabled={updateMutation.isPending}
                  />
                  <p className="text-xs text-muted-foreground">
                    配置后，rsshub.app 的订阅会自动通过该服务请求；留空则直接访问原地址。
                  </p>
                </Field>
                <Field>
                  <FieldLabel htmlFor="rsshub-access-key">Access Key（可选）</FieldLabel>
                  <div className="relative">
                    <Input
                      id="rsshub-access-key"
                      type={showRsshubAccessKey ? 'text' : 'password'}
                      value={rsshubAccessKey}
                      onChange={(event) => setRsshubAccessKey(event.target.value)}
                      autoComplete="off"
                      disabled={updateMutation.isPending}
                      className="pr-10"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      className="absolute top-1/2 right-1 -translate-y-1/2"
                      aria-label={showRsshubAccessKey ? '隐藏 Access Key' : '显示 Access Key'}
                      onClick={() => setShowRsshubAccessKey((visible) => !visible)}
                      disabled={updateMutation.isPending}
                    >
                      {showRsshubAccessKey ? <EyeOff /> : <Eye />}
                    </Button>
                  </div>
                </Field>
                <div className="flex gap-2">
                  <Button type="submit" disabled={!settings || updateMutation.isPending}>
                    {updateMutation.isPending ? '保存中...' : '保存 RSS 设置'}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={updateMutation.isPending}
                    onClick={() => {
                      updateMutation.reset();
                      setRsshubBaseUrl(settings?.rss.rsshub_base_url ?? '');
                      setRsshubAccessKey(settings?.rss.rsshub_access_key ?? '');
                      setShowRsshubAccessKey(false);
                      setEditingRss(false);
                    }}
                  >
                    取消
                  </Button>
                </div>
                {updateMutation.isError && editingPath === null && (
                  <p className="text-sm text-destructive">
                    保存失败：{errorMessage(updateMutation.error)}
                  </p>
                )}
              </form>
            ) : (
              <div className="flex flex-col gap-4">
                <div>
                  <p className="text-xs text-muted-foreground">RSSHub 服务地址</p>
                  <p className="mt-1 break-all text-sm">{rsshubBaseUrl || '未设置'}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Access Key</p>
                  <p className="mt-1 text-sm">{rsshubAccessKey ? '**********' : '未设置'}</p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function currentSettings(
  backupDir: string,
  notesDir: string,
  rsshubBaseUrl: string,
  rsshubAccessKey: string,
): AppSettings {
  return {
    common: {},
    bookmark: { backup_dir: backupDir.trim() || null },
    note: { notes_dir: notesDir.trim() || null },
    rss: {
      rsshub_base_url: rsshubBaseUrl.trim().replace(/\/+$/, '') || null,
      rsshub_access_key: rsshubAccessKey.trim() || null,
    },
  };
}

function errorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === 'object' && error && 'message' in error) return String(error.message);
  return '操作失败';
}

export default SettingsPage;
