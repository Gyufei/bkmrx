import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useTauriEvent } from '@/lib/use-tauri-event';
import { getSettingsApi, SettingsQueryApiKey } from '@/settings/settings.api';
import type { NoteFile } from '../types';
import {
  createNoteApi,
  deleteNoteFileApi,
  NotesQueryApiKey,
  renameNoteFileApi,
  scanNotesDirectoryApi,
} from './notes.api';

export function useNotesWorkspace() {
  const queryClient = useQueryClient();
  const { data: settings } = useQuery({
    queryKey: [SettingsQueryApiKey.SETTINGS],
    queryFn: getSettingsApi,
  });
  const notesDir = settings?.note.notes_dir ?? null;
  const notesQueryKey = [NotesQueryApiKey.NOTES, notesDir] as const;
  const notesQuery = useQuery({
    queryKey: notesQueryKey,
    queryFn: () => scanNotesDirectoryApi(notesDir!),
    enabled: !!notesDir,
  });

  useTauriEvent<NoteFile>(
    'note-changed',
    ({ payload: changed }) => {
      queryClient.setQueryData(notesQueryKey, (old: NoteFile[] | undefined) => {
        if (!old) return old;
        const index = old.findIndex((note) => note.path === changed.path);
        if (index < 0) return [changed, ...old];
        return old.map((note, currentIndex) => (currentIndex === index ? changed : note));
      });
    },
    !!notesDir,
  );

  useTauriEvent<string>(
    'note-removed',
    ({ payload: removedPath }) => {
      queryClient.setQueryData(notesQueryKey, (old: NoteFile[] | undefined) =>
        old?.filter((note) => note.path !== removedPath),
      );
    },
    !!notesDir,
  );

  const invalidateNotes = () => queryClient.invalidateQueries({ queryKey: notesQueryKey });
  const createNote = useMutation({
    mutationFn: (input: Parameters<typeof createNoteApi>[0]) => createNoteApi(input),
    onSuccess: invalidateNotes,
  });
  const deleteNote = useMutation({
    mutationFn: (path: string) => deleteNoteFileApi(path),
    onSuccess: invalidateNotes,
  });
  const renameNote = useMutation({
    mutationFn: (input: Parameters<typeof renameNoteFileApi>[0]) => renameNoteFileApi(input),
    onSuccess: invalidateNotes,
  });

  return {
    notesDir,
    notes: notesQuery.data ?? [],
    loading: notesQuery.isLoading,
    error: notesQuery.error,
    createNote,
    deleteNote,
    renameNote,
  };
}
