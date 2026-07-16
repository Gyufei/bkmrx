import { useState, useCallback, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { NoteFile } from "../types";

export function useNotes() {
  const [notes, setNotes] = useState<NoteFile[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Listen for real-time file events
  useEffect(() => {
    const unlisten1 = listen<NoteFile>("note-changed", (event) => {
      const changed = event.payload;
      setNotes(prev => {
        const idx = prev.findIndex(n => n.path === changed.path);
        let next: NoteFile[];
        if (idx >= 0) {
          next = [...prev];
          next[idx] = changed;
        } else {
          next = [...prev, changed];
        }
        return next.sort((a, b) => b.modified - a.modified);
      });
    });
    const unlisten2 = listen<string>("note-removed", (event) => {
      const path = event.payload;
      setNotes(prev => prev.filter(n => n.path !== path));
    });
    return () => {
      unlisten1.then(fn => fn());
      unlisten2.then(fn => fn());
    };
  }, []);

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

  const deleteNote = useCallback(async (path: string): Promise<void> => {
    await invoke("delete_note", { path });
    // The file watcher will emit note-removed, so no need to manually update state
  }, []);

  const renameNote = useCallback(async (oldPath: string, newPath: string): Promise<void> => {
    await invoke("rename_note", { oldPath, newPath });
    // The file watcher will emit note-removed + note-changed
  }, []);

  return { notes, loading, error, scanDir, readFile, saveFile, createFile, deleteNote, renameNote };
}
