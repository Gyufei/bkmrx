import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useTauriEvent } from '@/lib/use-tauri-event';
import { getSettingsApi, SettingsQueryApiKey } from '@/settings/settings.api';
import type { NotesWorkspaceChangedEvent } from '../types';
import {
  createNoteApi,
  deleteNoteFolderApi,
  deleteNoteFileApi,
  NotesQueryApiKey,
  openExternalNoteFileApi,
  preflightNoteFolderDeletionApi,
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

  useTauriEvent<NotesWorkspaceChangedEvent>(
    'notes-workspace-changed',
    ({ payload }) => {
      if (payload.revision !== workspaceRevision) return;
      void queryClient.invalidateQueries({ queryKey: notesQueryKey }).catch(() => undefined);
    },
    !!notesDir,
  );

  const invalidateNotes = () => queryClient.invalidateQueries({ queryKey: notesQueryKey });
  const invalidateNotesAfterMutation = () => {
    void invalidateNotes().catch(() => undefined);
  };
  const createNote = useMutation({
    mutationFn: (input: { directory: string; name: string }) =>
      createNoteApi({ revision: workspaceRevision!, ...input }),
    onSuccess: invalidateNotesAfterMutation,
  });
  const deleteNote = useMutation({
    mutationFn: (relativePath: string) => deleteNoteFileApi(workspaceRevision!, relativePath),
    onSuccess: invalidateNotesAfterMutation,
  });
  const deleteFolder = useMutation({
    mutationFn: (receipt: string) => deleteNoteFolderApi(receipt),
    onSuccess: invalidateNotesAfterMutation,
  });
  const preflightFolderDeletion = useMutation({
    mutationFn: (relativePath: string) =>
      preflightNoteFolderDeletionApi(workspaceRevision!, relativePath),
  });
  const renameNote = useMutation({
    mutationFn: (input: { relativePath: string; name: string }) =>
      renameNoteFileApi({ revision: workspaceRevision!, ...input }),
    onSuccess: invalidateNotesAfterMutation,
  });
  const openExternalFile = useMutation({
    mutationFn: (relativePath: string) => openExternalNoteFileApi(workspaceRevision!, relativePath),
  });

  return {
    notesDir,
    workspaceRevision,
    root: notesQuery.data?.root ?? null,
    notes: notesQuery.data?.notes ?? [],
    loading: notesQuery.isLoading,
    error: notesQuery.error,
    createNote,
    deleteNote,
    deleteFolder,
    preflightFolderDeletion,
    renameNote,
    openExternalFile,
    refreshNotes: invalidateNotes,
  };
}
