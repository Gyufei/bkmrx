// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import type { PropsWithChildren } from 'react';
import { afterEach, expect, it, vi } from 'vitest';

import type { NotesWorkspaceChangedEvent, WorkspaceDirectory } from '../types';
import { useNotesWorkspace } from './use-notes-workspace';

const eventHandlers = vi.hoisted(
  () => new Map<string, (event: { payload: NotesWorkspaceChangedEvent }) => void>(),
);
const createNoteApi = vi.hoisted(() => vi.fn());
const deleteNoteFileApi = vi.hoisted(() => vi.fn());
const deleteNoteFolderApi = vi.hoisted(() => vi.fn());
const preflightNoteFolderDeletionApi = vi.hoisted(() => vi.fn());
const renameNoteFileApi = vi.hoisted(() => vi.fn());
const scanNotesDirectoryApi = vi.hoisted(() => vi.fn());
const openExternalNoteFileApi = vi.hoisted(() => vi.fn());

vi.mock('@/lib/use-tauri-event', () => ({
  useTauriEvent: (
    eventName: string,
    handler: (event: { payload: NotesWorkspaceChangedEvent }) => void,
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
  preflightNoteFolderDeletionApi,
  renameNoteFileApi,
  openExternalNoteFileApi,
}));

afterEach(() => {
  cleanup();
  eventHandlers.clear();
  vi.clearAllMocks();
});

const root: WorkspaceDirectory = {
  name: 'notes',
  relative_path: '',
  directories: [],
  files: [{ name: 'first.md', relative_path: 'first.md', kind: 'markdown' }],
};

function createWrapper(queryClient: QueryClient) {
  return function Wrapper({ children }: PropsWithChildren) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}

it('reloads the complete workspace once for a matching structural event', async () => {
  const updatedRoot = {
    ...root,
    files: [...root.files, { name: 'page.html', relative_path: 'page.html', kind: 'external' }],
  } satisfies WorkspaceDirectory;
  scanNotesDirectoryApi
    .mockResolvedValueOnce({ revision: 1, root })
    .mockResolvedValueOnce({ revision: 1, root: updatedRoot });
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const { result } = renderHook(() => useNotesWorkspace(), {
    wrapper: createWrapper(queryClient),
  });
  await waitFor(() => expect(result.current.root).toEqual(root));

  act(() => eventHandlers.get('notes-workspace-changed')?.({ payload: { revision: 1 } }));

  await waitFor(() => expect(result.current.root).toEqual(updatedRoot));
  expect(scanNotesDirectoryApi).toHaveBeenCalledTimes(2);
});

it('retains the last successful workspace when a structural reload fails', async () => {
  scanNotesDirectoryApi
    .mockResolvedValueOnce({ revision: 1, root })
    .mockRejectedValueOnce(new Error('目录暂时不可读'));
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const { result } = renderHook(() => useNotesWorkspace(), {
    wrapper: createWrapper(queryClient),
  });
  await waitFor(() => expect(result.current.root).toEqual(root));

  act(() => eventHandlers.get('notes-workspace-changed')?.({ payload: { revision: 1 } }));

  await waitFor(() => expect(result.current.error?.message).toBe('目录暂时不可读'));
  expect(result.current.root).toEqual(root);
});

it('exposes create, rename, and delete mutations through the workspace hook', async () => {
  scanNotesDirectoryApi.mockResolvedValue({ revision: 1, root });
  createNoteApi.mockResolvedValue('new.md');
  renameNoteFileApi.mockResolvedValue('renamed.md');
  deleteNoteFileApi.mockResolvedValue(undefined);
  deleteNoteFolderApi.mockResolvedValue(undefined);
  preflightNoteFolderDeletionApi.mockResolvedValue({
    file_count: 1,
    directory_count: 0,
    invisible_entry_count: 0,
    receipt: 'folder-receipt',
  });
  openExternalNoteFileApi.mockResolvedValue(undefined);
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const { result } = renderHook(() => useNotesWorkspace(), {
    wrapper: createWrapper(queryClient),
  });
  await waitFor(() => expect(result.current.root).toEqual(root));

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

  act(() => result.current.deleteFolder.mutate('folder-receipt'));
  await waitFor(() => expect(deleteNoteFolderApi).toHaveBeenCalledWith('folder-receipt'));

  act(() => result.current.preflightFolderDeletion.mutate('folder'));
  await waitFor(() => expect(preflightNoteFolderDeletionApi).toHaveBeenCalledWith(1, 'folder'));

  act(() => result.current.openExternalFile.mutate('page.html'));
  await waitFor(() => expect(openExternalNoteFileApi).toHaveBeenCalledWith(1, 'page.html'));
});

it('does not turn successful mutations into failures when cache invalidation fails', async () => {
  scanNotesDirectoryApi.mockResolvedValue({ revision: 1, root });
  renameNoteFileApi.mockResolvedValue('renamed.md');
  deleteNoteFileApi.mockResolvedValue(undefined);
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  vi.spyOn(queryClient, 'invalidateQueries').mockRejectedValue(new Error('refresh failed'));
  const { result } = renderHook(() => useNotesWorkspace(), {
    wrapper: createWrapper(queryClient),
  });
  await waitFor(() => expect(result.current.root).toEqual(root));

  await expect(
    result.current.renameNote.mutateAsync({
      relativePath: 'first.md',
      name: 'renamed.md',
    }),
  ).resolves.toBe('renamed.md');
  await expect(result.current.deleteNote.mutateAsync('first.md')).resolves.toBeUndefined();
});
