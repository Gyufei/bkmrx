import { useState, useEffect } from "react";

interface Props {
  open: boolean;
  onClose: () => void;
  getBackupDir: () => Promise<string | null>;
  setBackupDir: (dir: string | null) => Promise<void>;
  onBackupNow: (dir: string) => Promise<string>;
}

export default function SettingsModal({ open, onClose, getBackupDir, setBackupDir, onBackupNow }: Props) {
  const [dir, setDir] = useState("");
  const [saving, setSaving] = useState(false);
  const [backupStatus, setBackupStatus] = useState<string | null>(null);
  const [backupLoading, setBackupLoading] = useState(false);

  useEffect(() => {
    if (open) {
      getBackupDir().then((d) => setDir(d ?? ""));
    }
  }, [open, getBackupDir]);

  const handleSave = async () => {
    setSaving(true);
    await setBackupDir(dir || null);
    setSaving(false);
  };

  const handleBackupNow = async () => {
    if (!dir) return;
    setBackupLoading(true);
    setBackupStatus(null);
    try {
      const path = await onBackupNow(dir);
      setBackupStatus(`已备份到: ${path}`);
    } catch (e) {
      setBackupStatus(`备份失败: ${e}`);
    } finally {
      setBackupLoading(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
      <div className="w-[420px] bg-surface-card dark:bg-surface-dark-card rounded-modal shadow-lg p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-text-primary dark:text-text-dark-primary">设置</h2>
          <button onClick={onClose} className="p-1 text-text-secondary dark:text-text-dark-secondary hover:text-text-primary dark:hover:text-text-dark-primary">
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 6 6 18"/><path d="m6 6 12 12"/>
            </svg>
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-text-primary dark:text-text-dark-primary mb-1">备份目录</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={dir}
                onChange={(e) => setDir(e.target.value)}
                placeholder="留空则不自动备份"
                className="flex-1 h-9 px-3 text-sm rounded-input border border-border dark:border-border-dark bg-surface dark:bg-surface-dark text-text-primary dark:text-text-dark-primary placeholder:text-text-secondary dark:placeholder:text-text-dark-secondary outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent"
              />
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-4 h-9 text-sm font-medium rounded-btn bg-accent text-white hover:bg-accent-hover dark:bg-accent-dark transition-colors disabled:opacity-50"
              >
                {saving ? "保存..." : "保存"}
              </button>
            </div>
            <p className="text-xs text-text-secondary dark:text-text-dark-secondary mt-1">应用启动时会自动导出到此目录</p>
          </div>

          <div>
            <button
              onClick={handleBackupNow}
              disabled={backupLoading || !dir}
              className="px-4 h-9 text-sm font-medium rounded-btn border border-border dark:border-border-dark text-text-primary dark:text-text-dark-primary hover:bg-accent-bg dark:hover:bg-accent-dark-bg transition-colors disabled:opacity-50"
            >
              {backupLoading ? "备份中..." : "立即备份"}
            </button>
            {backupStatus && (
              <p className="text-xs text-text-secondary dark:text-text-dark-secondary mt-1 break-all">{backupStatus}</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
