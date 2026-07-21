import { useState, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";

export interface SystemInfo {
  bkmr_config_path: string;
  sqlite_db_path: string;
  onnx_available: boolean;
  bkmr_version: string;
  bkmr_repo: string;
  app_version: string;
}

export function useSystemInfo() {
  const [info, setInfo] = useState<SystemInfo | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async (): Promise<void> => {
    setLoading(true);
    try {
      const result = await invoke<SystemInfo>("get_system_info");
      setInfo(result);
    } finally {
      setLoading(false);
    }
  }, []);

  return { info, loading, load };
}
