import { useState, useCallback } from "react";
import type { AppSettings } from "../hooks/useSettings";

interface Props {
  settings: AppSettings;
  onSave: (updated: Partial<AppSettings>) => Promise<AppSettings>;
  onBackupNow: (dir: string) => Promise<string>;
}

export default function SettingsPage({ settings, onSave, onBackupNow }: Props) {
  const [backupDir, setBackupDir] = useState(settings.backup_dir ?? "");
  const [notesDir, setNotesDir] = useState(settings.notes_dir ?? "");
  const [backupSaving, setBackupSaving] = useState(false);
  const [notesSaving, setNotesSaving] = useState(false);
  const [backupStatus, setBackupStatus] = useState<string | null>(null);
  const [backupLoading, setBackupLoading] = useState(false);

  const handleBackupSave = useCallback(async () => {
    setBackupSaving(true);
    await onSave({ backup_dir: backupDir || null });
    setBackupSaving(false);
  }, [backupDir, onSave]);

  const handleNotesSave = useCallback(async () => {
    setNotesSaving(true);
    await onSave({ notes_dir: notesDir || null });
    setNotesSaving(false);
  }, [notesDir, onSave]);

  const handleBackupNow = useCallback(async () => {
    if (!backupDir) return;
    setBackupLoading(true);
    setBackupStatus(null);
    try {
      const path = await onBackupNow(backupDir);
      setBackupStatus(`已备份到: ${path}`);
    } catch (e) {
      setBackupStatus(`备份失败: ${e}`);
    } finally {
      setBackupLoading(false);
    }
  }, [backupDir, onBackupNow]);

  return (
    <div className="flex-1 overflow-y-auto thin-scrollbar">
      <div className="max-w-xl mx-auto px-6 py-8 space-y-8">
        <div>
          <h2 className="text-base font-semibold text-text-primary dark:text-text-dark-primary mb-1">设置</h2>
          <p className="text-sm text-text-secondary dark:text-text-dark-secondary">应用全局偏好</p>
        </div>

        {/* Backup section */}
        <section>
          <h3 className="text-sm font-medium text-text-primary dark:text-text-dark-primary mb-3">书签备份</h3>
          <div className="space-y-3 p-4 rounded-card bg-surface-sidebar dark:bg-surface-dark-sidebar">
            <div>
              <label className="block text-xs font-medium text-text-secondary dark:text-text-dark-secondary mb-1.5">
                备份目录路径
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={backupDir}
                  onChange={(e) => setBackupDir(e.target.value)}
                  placeholder="留空则不自动备份"
                  className="flex-1 h-9 px-3 text-sm rounded-input border border-border dark:border-border-dark bg-surface dark:bg-surface-dark text-text-primary dark:text-text-dark-primary placeholder:text-text-secondary dark:placeholder:text-text-dark-secondary outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent transition-colors"
                />
                <button
                  onClick={handleBackupSave}
                  disabled={backupSaving}
                  className="px-4 h-9 text-sm font-medium rounded-btn bg-accent text-white hover:bg-accent-hover dark:bg-accent-dark transition-colors disabled:opacity-50"
                >
                  {backupSaving ? "保存..." : "保存"}
                </button>
              </div>
              <p className="text-xs text-text-secondary dark:text-text-dark-secondary mt-1.5">
                应用启动时自动导出书签到该目录
              </p>
            </div>
            <div>
              <button
                onClick={handleBackupNow}
                disabled={backupLoading || !backupDir}
                className="px-4 h-8 text-xs font-medium rounded-btn border border-border dark:border-border-dark text-text-primary dark:text-text-dark-primary hover:bg-accent-bg dark:hover:bg-accent-dark-bg transition-colors disabled:opacity-50"
              >
                {backupLoading ? "备份中..." : "立即备份"}
              </button>
              {backupStatus && (
                <p className="text-xs text-text-secondary dark:text-text-dark-secondary mt-1.5 break-all">
                  {backupStatus}
                </p>
              )}
            </div>
          </div>
        </section>

        {/* Notes section */}
        <section>
          <h3 className="text-sm font-medium text-text-primary dark:text-text-dark-primary mb-3">笔记目录</h3>
          <div className="space-y-3 p-4 rounded-card bg-surface-sidebar dark:bg-surface-dark-sidebar">
            <label className="block text-xs font-medium text-text-secondary dark:text-text-dark-secondary mb-1.5">
              Obsidian vault 路径
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={notesDir}
                onChange={(e) => setNotesDir(e.target.value)}
                placeholder="输入 Obsidian 笔记目录路径"
                className="flex-1 h-9 px-3 text-sm rounded-input border border-border dark:border-border-dark bg-surface dark:bg-surface-dark text-text-primary dark:text-text-dark-primary placeholder:text-text-secondary dark:placeholder:text-text-dark-secondary outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent transition-colors"
              />
              <button
                onClick={handleNotesSave}
                disabled={notesSaving}
                className="px-4 h-9 text-sm font-medium rounded-btn bg-accent text-white hover:bg-accent-hover dark:bg-accent-dark transition-colors disabled:opacity-50"
              >
                {notesSaving ? "保存..." : "保存"}
              </button>
            </div>
            <p className="text-xs text-text-secondary dark:text-text-dark-secondary">
              保存后切换到"笔记"页签即可浏览目录中的 Markdown 文件
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}
