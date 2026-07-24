import { useCallback, useEffect, useState } from 'react';
import { open, save } from '@tauri-apps/plugin-dialog';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Copy } from 'lucide-react';

import { BkQueryApiKey } from '@/bookmarks/bookmarks.api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { AppSettings } from '@/lib/invoke';
import {
  applyBookmarkImportApi,
  exportBookmarksApi,
  getSettingsApi,
  getSystemInfoApi,
  previewBookmarkImportApi,
  SettingsQueryApiKey,
  updateSettingsApi,
} from '@/settings/settings.api';
import type { ImportPreview } from '@/types';

function SettingsPage() {
  const queryClient = useQueryClient();
  const [backupDir, setBackupDir] = useState('');
  const [notesDir, setNotesDir] = useState('');
  const [importCandidate, setImportCandidate] = useState<{
    path: string;
    preview: ImportPreview;
  } | null>(null);

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
  const exportMutation = useMutation({ mutationFn: exportBookmarksApi });
  const previewMutation = useMutation({
    mutationFn: previewBookmarkImportApi,
    onSuccess: (preview, path) => setImportCandidate({ path, preview }),
  });
  const applyMutation = useMutation({
    mutationFn: applyBookmarkImportApi,
    onSuccess: () => {
      setImportCandidate(null);
      queryClient.invalidateQueries({ queryKey: [BkQueryApiKey.BOOKMARKS] });
      queryClient.invalidateQueries({ queryKey: [BkQueryApiKey.TAGS] });
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

  async function chooseExportPath() {
    const selected = await save({
      defaultPath: exportDefaultPath(backupDir),
      filters: [{ name: 'JSON', extensions: ['json'] }],
    });
    if (selected) exportMutation.mutate(selected);
  }

  async function chooseImportPath() {
    const selected = await open({
      multiple: false,
      directory: false,
      filters: [{ name: 'JSON', extensions: ['json'] }],
    });
    if (typeof selected === 'string') {
      setImportCandidate(null);
      previewMutation.mutate(selected);
    }
  }

  function saveBackupDirectory() {
    if (!settings) return;
    updateMutation.mutate(currentSettings(backupDir, notesDir));
  }

  function saveNotesDirectory() {
    if (!settings) return;
    updateMutation.mutate(currentSettings(backupDir, notesDir));
  }

  return (
    <div className="flex-1 overflow-y-auto thin-scrollbar">
      <div className="max-w-xl mx-auto px-6 py-8 space-y-8">
        <section>
          <h3 className="text-sm font-medium text-foreground mb-3">系统信息</h3>
          <div className="space-y-2 p-4 rounded-lg bg-sidebar">
            {sysInfo ? (
              [
                ['App Data', sysInfo.app_data_dir],
                ['SQLite 数据库', sysInfo.sqlite_db_path],
                ['Schema 版本', String(sysInfo.schema_version)],
                ['搜索后端', sysInfo.search_backend],
                ['App 版本', sysInfo.app_version],
              ].map(([label, value]) => (
                <div key={label} className="flex items-start justify-between gap-3">
                  <span className="text-xs font-medium text-muted-foreground shrink-0">
                    {label}
                  </span>
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="text-xs text-foreground break-all">{value}</span>
                    <button
                      onClick={() => handleCopy(value)}
                      className="shrink-0 p-0.5 rounded hover:bg-accent"
                      title="复制"
                    >
                      <Copy className="w-3.5 h-3.5 text-muted-foreground" />
                    </button>
                  </div>
                </div>
              ))
            ) : (
              <p className="text-xs text-muted-foreground">加载中...</p>
            )}
          </div>
        </section>

        <section>
          <h3 className="text-sm font-medium text-foreground mb-3">JSON 导入与导出</h3>
          <div className="space-y-4 p-4 rounded-lg bg-sidebar">
            <div>
              <Label className="block text-xs text-muted-foreground mb-1.5">默认备份目录</Label>
              <div className="flex gap-2">
                <Input
                  value={backupDir}
                  onChange={(event) => setBackupDir(event.target.value)}
                  placeholder="/Users/me/CloudDrive/bookmarks"
                />
                <Button
                  onClick={saveBackupDirectory}
                  disabled={updateMutation.isPending || !settings}
                >
                  保存
                </Button>
              </div>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={chooseExportPath}
                disabled={exportMutation.isPending}
              >
                {exportMutation.isPending ? '导出中...' : '导出 JSON'}
              </Button>
              <Button
                variant="outline"
                onClick={chooseImportPath}
                disabled={previewMutation.isPending || applyMutation.isPending}
              >
                {previewMutation.isPending ? '预检中...' : '导入 JSON'}
              </Button>
            </div>
            {exportMutation.data && (
              <p className="text-xs text-muted-foreground break-all">
                已导出：{exportMutation.data}
              </p>
            )}
            {importCandidate && (
              <div className="space-y-2 rounded-md border border-border p-3 text-xs">
                <p className="font-medium">导入预检通过</p>
                <p>
                  共 {importCandidate.preview.total} 条；新增{' '}
                  {importCandidate.preview.create_count}，更新{' '}
                  {importCandidate.preview.update_count}，跳过{' '}
                  {importCandidate.preview.skip_count}
                </p>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    onClick={() =>
                      applyMutation.mutate({
                        path: importCandidate.path,
                        fileHash: importCandidate.preview.file_hash,
                      })
                    }
                    disabled={applyMutation.isPending}
                  >
                    {applyMutation.isPending ? '导入中...' : '确认导入'}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setImportCandidate(null)}
                    disabled={applyMutation.isPending}
                  >
                    取消
                  </Button>
                </div>
              </div>
            )}
            {applyMutation.isSuccess && (
              <p className="text-xs text-muted-foreground">导入完成，书签与标签已刷新。</p>
            )}
            {[exportMutation.error, previewMutation.error, applyMutation.error]
              .filter(Boolean)
              .map((error, index) => (
                <p key={index} className="text-xs text-destructive">
                  {errorMessage(error)}
                </p>
              ))}
          </div>
        </section>

        <section>
          <h3 className="text-sm font-medium text-foreground mb-3">笔记目录</h3>
          <div className="space-y-3 p-4 rounded-lg bg-sidebar">
            <Label className="block text-xs text-muted-foreground">Obsidian vault 路径</Label>
            <div className="flex gap-2">
              <Input
                value={notesDir}
                onChange={(event) => setNotesDir(event.target.value)}
                placeholder="输入 Obsidian 笔记目录路径"
              />
              <Button
                onClick={saveNotesDirectory}
                disabled={updateMutation.isPending || !settings}
              >
                保存
              </Button>
            </div>
          </div>
        </section>
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

function exportDefaultPath(backupDir: string) {
  const stamp = new Date().toISOString().replace(/[-:]/g, '').slice(0, 15);
  const filename = `bookmarks-${stamp}.json`;
  return backupDir.trim() ? `${backupDir.replace(/\/$/, '')}/${filename}` : filename;
}

function errorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === 'object' && error && 'message' in error) {
    return String(error.message);
  }
  return '操作失败';
}

export default SettingsPage;
