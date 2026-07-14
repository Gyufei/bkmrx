import { useState, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { NoteFile } from "../types";

export function useNotes() {
  const [notes, setNotes] = useState<NoteFile[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const scanDir = useCallback(async (dir: string): Promise<NoteFile[]> => {
    setLoading(true);
    setError(null);
    try {
      const result = await invoke<NoteFile[]>("scan_notes", { dir });
      setNotes(result);
      return result;
    } catch (e) {
      setError(String(e));
      setNotes([]);
      return [];
    } finally {
      setLoading(false);
    }
  }, []);

  const readFile = useCallback(async (path: string): Promise<string> => {
    return await invoke<string>("read_note_file", { path });
  }, []);

  const saveFile = useCallback(async (path: string, content: string): Promise<void> => {
    await invoke("write_note_file", { path, content });
  }, []);

  const createFile = useCallback(async (dir: string, name: string): Promise<string> => {
    return await invoke<string>("create_note_file", { dir, name });
  }, []);

  return { notes, loading, error, scanDir, readFile, saveFile, createFile };
}
