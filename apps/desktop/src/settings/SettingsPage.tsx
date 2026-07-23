import { useState, useCallback, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Copy } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { backupBookmarksApi } from '@/bookmarks/bookmarks.api';
import { getSettingsApi, getSystemInfoApi, SettingsQueryApiKey, updateSettingsApi } from '@/settings/settings.api';

function SettingsPage() {
  const queryClient = useQueryClient();

  const { data: settings, isLoading: _isLoadingSettings } = useQuery({
    queryKey: [SettingsQueryApiKey.SETTINGS],
    queryFn: getSettingsApi,
  });

  const { data: sysInfo, isLoading: _isLoadingSysInfo } = useQuery({
    queryKey: [SettingsQueryApiKey.SYSTEM_INFO],
    queryFn: getSystemInfoApi,
  });

  const { mutate: handleUpdate, isPending: isUpdatingSettings } = useMutation({
    mutationFn: updateSettingsApi,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings'] });
    },
  });

  const { data: backupResult, mutate: handleBackup, isPending: isBackupPending, isSuccess: isBackupSuccess } = useMutation({
    mutationFn: backupBookmarksApi,
  });

  const [backupDir, setBackupDir] = useState('');
  const [notesDir, setNotesDir] = useState('');

  // Sync form fields when settings are loaded / change
  useEffect(() => {
    setBackupDir(settings?.backup_dir ?? '');
    setNotesDir(settings?.notes_dir ?? '');
  }, [settings?.backup_dir, settings?.notes_dir]);

  const handleCopy = useCallback(async (_key: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      /* silently ignore */
    }
  }, []);

  function handleBackupSave() {
    if (!settings) return;

    handleUpdate({
      ...settings,
      backup_dir: backupDir || null,  
    });
  }

  function handleNotesSave() {
    if (!settings) return;

    handleUpdate({
      ...settings,
      notes_dir: notesDir || null,
    });
  }

  function handleBackupNow() {
    if (!backupDir) return;

    handleBackup(backupDir);
  }

  return (
    <div className="flex-1 overflow-y-auto thin-scrollbar">
      <div className="max-w-xl mx-auto px-6 py-8 space-y-8">
        {/* System info section */}
        <section>
          <h3 className="text-sm font-medium text-foreground mb-3">系统信息</h3>
          <div className="space-y-3 p-4 rounded-lg bg-sidebar">
            {sysInfo ? (
              <div className="space-y-2">
                {[
                  { key: 'config_path', label: 'bkmr 配置路径', value: sysInfo.bkmr_config_path },
                  { key: 'db_path', label: 'SQLite 数据库路径', value: sysInfo.sqlite_db_path },
                  {
                    key: 'onnx',
                    label: 'ONNX / 嵌入模型',
                    value: sysInfo.onnx_available ? '已加载' : '未配置',
                  },
                  { key: 'bkmr_version', label: 'bkmr 版本', value: sysInfo.bkmr_version },
                ].map((item) => (
                  <div key={item.key} className="flex items-start justify-between gap-2">
                    <span className="text-xs font-medium text-muted-foreground shrink-0 mt-0.5">
                      {item.label}
                    </span>
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="text-xs text-foreground break-all">{item.value}</span>
                      <button
                        onClick={() => handleCopy(item.key, item.value)}
                        className="shrink-0 p-0.5 rounded hover:bg-accent transition-colors"
                        title="复制"
                      >
                        <Copy className="w-3.5 h-3.5 text-muted-foreground" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">加载中...</p>
            )}
          </div>
        </section>

        <div>
          <h2 className="text-base font-semibold text-foreground mb-1">设置</h2>
          <p className="text-sm text-muted-foreground">应用全局偏好</p>
        </div>

        {/* Backup section */}
        <section>
          <h3 className="text-sm font-medium text-foreground mb-3">书签备份</h3>
          <div className="space-y-3 p-4 rounded-lg bg-sidebar">
            <div>
              <Label className="block text-xs font-medium text-muted-foreground mb-1.5">
                备份目录路径
              </Label>
              <div className="flex gap-2">
                <Input
                  type="text"
                  value={backupDir}
                  onChange={(e) => setBackupDir(e.target.value)}
                  placeholder="留空则不自动备份"
                />
                <Button onClick={handleBackupSave} disabled={isBackupPending}>
                  {isBackupPending ? '保存...' : '保存'}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground mt-1.5">应用启动时自动导出书签到该目录</p>
            </div>
            <div>
              <Button
                variant="outline"
                size="sm"
                onClick={handleBackupNow}
                disabled={isBackupPending || !backupDir}
              >
                {isBackupPending ? '备份中...' : '立即备份'}
              </Button>
              {isBackupSuccess && (
                <p className="text-xs text-muted-foreground mt-1.5 break-all">{backupResult}</p>
              )}
            </div>
          </div>
        </section>

        {/* Notes section */}
        <section>
          <h3 className="text-sm font-medium text-foreground mb-3">笔记目录</h3>
          <div className="space-y-3 p-4 rounded-lg bg-sidebar">
            <Label className="block text-xs font-medium text-muted-foreground mb-1.5">
              Obsidian vault 路径
            </Label>
            <div className="flex gap-2">
              <Input
                type="text"
                value={notesDir}
                onChange={(e) => setNotesDir(e.target.value)}
                placeholder="输入 Obsidian 笔记目录路径"
              />
              <Button onClick={handleNotesSave} disabled={isUpdatingSettings}>
                {isUpdatingSettings ? '保存...' : '保存'}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              保存后切换到"笔记"页签即可浏览目录中的 Markdown 文件
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}

export default SettingsPage;
