import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useTauriEvent } from '@/lib/use-tauri-event';
import { getSettingsApi, SettingsQueryApiKey } from '@/settings/settings.api';
import type { NoteChangedEvent, NoteRemovedEvent, NotesWorkspaceListing } from '../types';
import {
  createNoteApi,
  deleteNoteFolderApi,
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
  const notesDir = settings?.settings.common.paths.notes_dir ?? null;
  const notesQueryKey = [NotesQueryApiKey.NOTES, notesDir, settings?.revision] as const;
  const notesQuery = useQuery({
    queryKey: notesQueryKey,
    queryFn: scanNotesDirectoryApi,
    enabled: !!notesDir,
  });

  const workspaceRevision = notesQuery.data?.revision ?? null;

  useTauriEvent<NoteChangedEvent>(
    'note-changed',
    ({ payload }) => {
      queryClient.setQueryData(notesQueryKey, (old: NotesWorkspaceListing | undefined) => {
        if (!old || old.revision !== payload.revision) return old;
        const index = old.notes.findIndex(
          (note) => note.relative_path === payload.note.relative_path,
        );
        const notes =
          index < 0
            ? [payload.note, ...old.notes]
            : old.notes.map((note, i) => (i === index ? payload.note : note));
        return { ...old, notes };
      });
    },
    !!notesDir,
  );

  useTauriEvent<NoteRemovedEvent>(
    'note-removed',
    ({ payload }) => {
      queryClient.setQueryData(notesQueryKey, (old: NotesWorkspaceListing | undefined) =>
        !old || old.revision !== payload.revision
          ? old
          : {
              ...old,
              notes: old.notes.filter((note) => note.relative_path !== payload.relative_path),
            },
      );
    },
    !!notesDir,
  );

  const invalidateNotes = () => queryClient.invalidateQueries({ queryKey: notesQueryKey });
  const createNote = useMutation({
    mutationFn: (input: { directory: string; name: string }) =>
      createNoteApi({ revision: workspaceRevision!, ...input }),
    onSuccess: invalidateNotes,
  });
  const deleteNote = useMutation({
    mutationFn: (relativePath: string) => deleteNoteFileApi(workspaceRevision!, relativePath),
    onSuccess: invalidateNotes,
  });
  const deleteFolder = useMutation({
    mutationFn: (relativePath: string) => deleteNoteFolderApi(workspaceRevision!, relativePath),
    onSuccess: invalidateNotes,
  });
  const renameNote = useMutation({
    mutationFn: (input: { relativePath: string; name: string }) =>
      renameNoteFileApi({ revision: workspaceRevision!, ...input }),
    onSuccess: invalidateNotes,
  });

  return {
    notesDir,
    workspaceRevision,
    notes: notesQuery.data?.notes ?? [],
    loading: notesQuery.isLoading,
    error: notesQuery.error,
    createNote,
    deleteNote,
    deleteFolder,
    renameNote,
  };
}
