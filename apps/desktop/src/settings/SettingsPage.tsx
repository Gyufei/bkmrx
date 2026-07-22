import { useState, useCallback, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Copy } from 'lucide-react';
import { useSettings } from './useSettings';
import { useBkmr } from '../bookmarks/useBkmr';
import { useSystemInfo } from './useSystemInfo';

function SettingsPage() {
  const settings = useSettings();
  const { backup } = useBkmr();
  const { info: sysInfo, load: loadSysInfo } = useSystemInfo();

  const [backupDir, setBackupDir] = useState('');
  const [notesDir, setNotesDir] = useState('');
  const [backupSaving, setBackupSaving] = useState(false);
  const [notesSaving, setNotesSaving] = useState(false);
  const [backupStatus, setBackupStatus] = useState<string | null>(null);
  const [backupLoading, setBackupLoading] = useState(false);

  useEffect(() => {
    loadSysInfo();
  }, [loadSysInfo]);
  useEffect(() => {
    settings.load();
  }, []);

  // Sync form fields when settings are loaded / change
  useEffect(() => {
    setBackupDir(settings.settings.backup_dir ?? '');
    setNotesDir(settings.settings.notes_dir ?? '');
  }, [settings.settings.backup_dir, settings.settings.notes_dir]);

  const handleCopy = useCallback(async (_key: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      /* silently ignore */
    }
  }, []);

  const handleBackupSave = useCallback(async () => {
    setBackupSaving(true);
    await settings.save({ backup_dir: backupDir || null });
    setBackupSaving(false);
  }, [backupDir, settings.save]);

  const handleNotesSave = useCallback(async () => {
    setNotesSaving(true);
    await settings.save({ notes_dir: notesDir || null });
    setNotesSaving(false);
  }, [notesDir, settings.save]);

  const handleBackupNow = useCallback(async () => {
    if (!backupDir) return;
    setBackupLoading(true);
    setBackupStatus(null);
    try {
      const path = await backup(backupDir);
      setBackupStatus(`已备份到: ${path}`);
    } catch (e) {
      setBackupStatus(`备份失败: ${e}`);
    } finally {
      setBackupLoading(false);
    }
  }, [backupDir, backup]);

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
                <Button onClick={handleBackupSave} disabled={backupSaving}>
                  {backupSaving ? '保存...' : '保存'}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground mt-1.5">应用启动时自动导出书签到该目录</p>
            </div>
            <div>
              <Button
                variant="outline"
                size="sm"
                onClick={handleBackupNow}
                disabled={backupLoading || !backupDir}
              >
                {backupLoading ? '备份中...' : '立即备份'}
              </Button>
              {backupStatus && (
                <p className="text-xs text-muted-foreground mt-1.5 break-all">{backupStatus}</p>
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
              <Button onClick={handleNotesSave} disabled={notesSaving}>
                {notesSaving ? '保存...' : '保存'}
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
