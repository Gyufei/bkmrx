import { useState, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";

export interface AppSettings {
  backup_dir: string | null;
  notes_dir: string | null;
}

export function useSettings() {
  const [settings, setSettings] = useState<AppSettings>({
    backup_dir: null,
    notes_dir: null,
  });
  const [loading, setLoading] = useState(false);

  const load = useCallback(async (): Promise<AppSettings> => {
    setLoading(true);
    try {
      const result = await invoke<AppSettings>("get_settings");
      setSettings(result);
      return result;
    } finally {
      setLoading(false);
    }
  }, []);

  const save = useCallback(async (updated: Partial<AppSettings>): Promise<AppSettings> => {
    const merged = { ...settings, ...updated };
    setLoading(true);
    try {
      await invoke("update_settings", { settings: merged });
      setSettings(merged);
      return merged;
    } finally {
      setLoading(false);
    }
  }, [settings]);

  return { settings, loading, load, save };
}
