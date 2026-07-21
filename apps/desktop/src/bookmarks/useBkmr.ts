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

  const addBookmark = useCallback(async (url: string, title: string, tags: string[], description?: string): Promise<number> => {
    return await invoke<number>("add_bookmark", { url, title, tags, description });
  }, []);

  const searchBookmarks = useCallback(async (query: string, tags: string[]): Promise<Bookmark[]> => {
    return await invoke<Bookmark[]>("hybrid_search_bookmarks", { query, tags });
  }, []);

  const deleteBookmarks = useCallback(async (ids: number[]): Promise<number> => {
    return await invoke<number>("delete_bookmarks", { ids });
  }, []);

  const checkBookmark = useCallback(async (url: string): Promise<Bookmark | null> => {
    try {
      return await invoke<Bookmark | null>("check_bookmark", { url });
    } catch {
      return null;
    }
  }, []);

  const updateBookmark = useCallback(async (id: number, title: string, tags: string[], description?: string): Promise<void> => {
    await invoke("update_bookmark", { id, title, tags, description: description ?? null });
  }, []);

  return { allBookmarks, loading, error, loadAll, fetchTags, backup, addBookmark, checkBookmark, updateBookmark, deleteBookmarks, searchBookmarks };
}
