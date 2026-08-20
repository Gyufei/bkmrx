// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import type { PropsWithChildren } from 'react';
import { afterEach, expect, it, vi } from 'vitest';

import type { NoteFile } from '../types';
import { useNotesWorkspace } from './use-notes-workspace';

const eventHandlers = vi.hoisted(
  () => new Map<string, (event: { payload: NoteFile | string }) => void>(),
);
const createNoteApi = vi.hoisted(() => vi.fn());
const deleteNoteFileApi = vi.hoisted(() => vi.fn());
const renameNoteFileApi = vi.hoisted(() => vi.fn());
const scanNotesDirectoryApi = vi.hoisted(() => vi.fn());

vi.mock('@/lib/use-tauri-event', () => ({
  useTauriEvent: (eventName: string, handler: (event: { payload: NoteFile | string }) => void) =>
    eventHandlers.set(eventName, handler),
}));

vi.mock('@/settings/settings.api', () => ({
  SettingsQueryApiKey: { SETTINGS: 'settings' },
  getSettingsApi: vi.fn().mockResolvedValue({ note: { notes_dir: '/notes' } }),
}));

vi.mock('./notes.api', () => ({
  NotesQueryApiKey: { NOTES: 'notes' },
  scanNotesDirectoryApi,
  createNoteApi,
  deleteNoteFileApi,
  renameNoteFileApi,
}));

afterEach(() => {
  cleanup();
  eventHandlers.clear();
  vi.clearAllMocks();
});

const firstNote: NoteFile = {
  path: '/notes/first.md',
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
  scanNotesDirectoryApi.mockResolvedValue([firstNote]);
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const { result } = renderHook(() => useNotesWorkspace(), {
    wrapper: createWrapper(queryClient),
  });
  await waitFor(() => expect(result.current.notes).toEqual([firstNote]));

  const changedNote = { ...firstNote, title: '外部修改' };
  act(() => eventHandlers.get('note-changed')?.({ payload: changedNote }));
  await waitFor(() => expect(result.current.notes).toEqual([changedNote]));

  act(() => eventHandlers.get('note-removed')?.({ payload: firstNote.path }));
  await waitFor(() => expect(result.current.notes).toEqual([]));
});

it('exposes create, rename, and delete mutations through the workspace hook', async () => {
  scanNotesDirectoryApi.mockResolvedValue([firstNote]);
  createNoteApi.mockResolvedValue('/notes/new.md');
  renameNoteFileApi.mockResolvedValue(undefined);
  deleteNoteFileApi.mockResolvedValue(undefined);
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const { result } = renderHook(() => useNotesWorkspace(), {
    wrapper: createWrapper(queryClient),
  });
  await waitFor(() => expect(result.current.notes).toEqual([firstNote]));

  act(() => result.current.createNote.mutate({ dir: '/notes', name: 'new' }));
  await waitFor(() => expect(createNoteApi).toHaveBeenCalledWith({ dir: '/notes', name: 'new' }));

  act(() =>
    result.current.renameNote.mutate({
      oldPath: '/notes/first.md',
      newPath: '/notes/renamed.md',
    }),
  );
  await waitFor(() =>
    expect(renameNoteFileApi).toHaveBeenCalledWith({
      oldPath: '/notes/first.md',
      newPath: '/notes/renamed.md',
    }),
  );

  act(() => result.current.deleteNote.mutate('/notes/first.md'));
  await waitFor(() => expect(deleteNoteFileApi).toHaveBeenCalledWith('/notes/first.md'));
});
