import { useState, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { Bookmark, Tag } from "../types";

export function useBkmr() {
  const [allBookmarks, setAllBookmarks] = useState<Bookmark[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadAll = useCallback(async (): Promise<Bookmark[]> => {
    setLoading(true);
    setError(null);
    try {
      const result = await invoke<Bookmark[]>("load_all_bookmarks");
      setAllBookmarks(result);
      return result;
    } catch (e) {
      setError(String(e));
      setAllBookmarks([]);
      return [];
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchTags = useCallback(async (): Promise<Tag[]> => {
    try {
      return await invoke<Tag[]>("get_all_tags");
    } catch {
      return [];
    }
  }, []);

  const backup = useCallback(async (dir: string): Promise<string> => {
    return await invoke<string>("backup_bookmarks", { dir });
  }, []);

  return { allBookmarks, loading, error, loadAll, fetchTags, backup };
}
