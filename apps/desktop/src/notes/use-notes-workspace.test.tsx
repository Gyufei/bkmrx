// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import type { PropsWithChildren } from 'react';
import { afterEach, expect, it, vi } from 'vitest';

import type { NoteChangedEvent, NoteFile, NoteRemovedEvent } from '../types';
import { useNotesWorkspace } from './use-notes-workspace';

const eventHandlers = vi.hoisted(
  () => new Map<string, (event: { payload: NoteChangedEvent | NoteRemovedEvent }) => void>(),
);
const createNoteApi = vi.hoisted(() => vi.fn());
const deleteNoteFileApi = vi.hoisted(() => vi.fn());
const deleteNoteFolderApi = vi.hoisted(() => vi.fn());
const renameNoteFileApi = vi.hoisted(() => vi.fn());
const scanNotesDirectoryApi = vi.hoisted(() => vi.fn());

vi.mock('@/lib/use-tauri-event', () => ({
  useTauriEvent: (
    eventName: string,
    handler: (event: { payload: NoteChangedEvent | NoteRemovedEvent }) => void,
  ) => eventHandlers.set(eventName, handler),
}));

vi.mock('@/settings/settings.api', () => ({
  SettingsQueryApiKey: { SETTINGS: 'settings' },
  getSettingsApi: vi.fn().mockResolvedValue({
    revision: 1,
    settings: { common: { paths: { notes_dir: '/notes' } } },
    providers: [],
  }),
}));

vi.mock('./notes.api', () => ({
  NotesQueryApiKey: { NOTES: 'notes' },
  scanNotesDirectoryApi,
  createNoteApi,
  deleteNoteFileApi,
  deleteNoteFolderApi,
  renameNoteFileApi,
}));

afterEach(() => {
  cleanup();
  eventHandlers.clear();
  vi.clearAllMocks();
});

const firstNote: NoteFile = {
  relative_path: 'first.md',
  title: '第一篇笔记',
  tags: [],
  modified: 0,
  size: 0,
};

function createWrapper(queryClient: QueryClient) {
  return function Wrapper({ children }: PropsWithChildren) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}

it('synchronizes note watcher events into the notes query cache', async () => {
  scanNotesDirectoryApi.mockResolvedValue({ revision: 1, notes: [firstNote] });
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const { result } = renderHook(() => useNotesWorkspace(), {
    wrapper: createWrapper(queryClient),
  });
  await waitFor(() => expect(result.current.notes).toEqual([firstNote]));

  const changedNote = { ...firstNote, title: '外部修改' };
  act(() => eventHandlers.get('note-changed')?.({ payload: { revision: 1, note: changedNote } }));
  await waitFor(() => expect(result.current.notes).toEqual([changedNote]));

  act(() =>
    eventHandlers.get('note-removed')?.({
      payload: { revision: 1, relative_path: firstNote.relative_path },
    }),
  );
  await waitFor(() => expect(result.current.notes).toEqual([]));
});

it('exposes create, rename, and delete mutations through the workspace hook', async () => {
  scanNotesDirectoryApi.mockResolvedValue({ revision: 1, notes: [firstNote] });
  createNoteApi.mockResolvedValue('new.md');
  renameNoteFileApi.mockResolvedValue('renamed.md');
  deleteNoteFileApi.mockResolvedValue(undefined);
  deleteNoteFolderApi.mockResolvedValue(undefined);
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const { result } = renderHook(() => useNotesWorkspace(), {
    wrapper: createWrapper(queryClient),
  });
  await waitFor(() => expect(result.current.notes).toEqual([firstNote]));

  act(() => result.current.createNote.mutate({ directory: '', name: 'new' }));
  await waitFor(() =>
    expect(createNoteApi).toHaveBeenCalledWith({ revision: 1, directory: '', name: 'new' }),
  );

  act(() =>
    result.current.renameNote.mutate({
      relativePath: 'first.md',
      name: 'renamed.md',
    }),
  );
  await waitFor(() =>
    expect(renameNoteFileApi).toHaveBeenCalledWith({
      revision: 1,
      relativePath: 'first.md',
      name: 'renamed.md',
    }),
  );

  act(() => result.current.deleteNote.mutate('first.md'));
  await waitFor(() => expect(deleteNoteFileApi).toHaveBeenCalledWith(1, 'first.md'));

  act(() => result.current.deleteFolder.mutate('folder'));
  await waitFor(() => expect(deleteNoteFolderApi).toHaveBeenCalledWith(1, 'folder'));
});

it('does not turn successful mutations into failures when cache invalidation fails', async () => {
  scanNotesDirectoryApi.mockResolvedValue({ revision: 1, notes: [firstNote] });
  renameNoteFileApi.mockResolvedValue('renamed.md');
  deleteNoteFileApi.mockResolvedValue(undefined);
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  vi.spyOn(queryClient, 'invalidateQueries').mockRejectedValue(new Error('refresh failed'));
  const { result } = renderHook(() => useNotesWorkspace(), {
    wrapper: createWrapper(queryClient),
  });
  await waitFor(() => expect(result.current.notes).toEqual([firstNote]));

  await expect(
    result.current.renameNote.mutateAsync({
      relativePath: 'first.md',
      name: 'renamed.md',
    }),
  ).resolves.toBe('renamed.md');
  await expect(result.current.deleteNote.mutateAsync('first.md')).resolves.toBeUndefined();
});
