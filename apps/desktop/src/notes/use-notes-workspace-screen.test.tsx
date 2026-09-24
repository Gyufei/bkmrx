// @vitest-environment jsdom

import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

import type { WorkspaceFile } from '../types';
import { useNotesWorkspaceScreen } from './use-notes-workspace-screen';

const workspace = vi.hoisted(() => ({
  notesDir: '/notes' as string | null,
  workspaceRevision: 1 as number | null,
  root: {
    name: 'notes',
    relative_path: '',
    files: [] as WorkspaceFile[],
    directories: [],
  },
  loading: false,
  error: null as Error | null,
  createNote: mutation(),
  deleteNote: mutation(),
  deleteFolder: mutation(),
  preflightFolderDeletion: mutation(),
  renameNote: mutation(),
  openExternalFile: mutation(),
  refreshNotes: vi.fn().mockResolvedValue(undefined),
}));

function mutation() {
  return {
    isPending: false,
    error: null as Error | null,
    reset: vi.fn(),
    mutate: vi.fn(),
    mutateAsync: vi.fn(),
  };
}

vi.mock('./use-notes-workspace', () => ({
  useNotesWorkspace: () => workspace,
}));

const first = entry('first.md');
const second = entry('second.md');

function entry(relativePath: string): WorkspaceFile {
  return {
    name: relativePath,
    relative_path: relativePath,
    kind: 'markdown',
    capabilities: {
      primary_interaction: 'edit',
      can_rename: true,
      can_delete: true,
      can_open_with_system: false,
    },
  };
}

beforeEach(() => {
  workspace.root.files = [first, second];
  workspace.renameNote.mutateAsync.mockReset();
  workspace.refreshNotes.mockClear();
});

it('keeps the active Workspace Entry when its Document Session cannot flush', async () => {
  const session = {
    flush: vi.fn().mockRejectedValue(new Error('保存失败')),
    rename: vi.fn(),
    delete: vi.fn(),
  };
  const { result } = renderHook(() => useNotesWorkspaceScreen());

  await act(() => result.current.send({ type: 'entry.activated', entry: first }));
  await act(() => result.current.send({ type: 'document-session.changed', session }));
  await act(() => result.current.send({ type: 'entry.activated', entry: second }));

  expect(result.current.view.selectedEntry).toEqual(first);
  expect(result.current.view.problem?.message).toBe('无法切换笔记：保存失败');
});

it('routes an active Markdown Document rename through its Document Session', async () => {
  const session = {
    flush: vi.fn().mockResolvedValue(undefined),
    rename: vi.fn().mockResolvedValue('renamed.md'),
    delete: vi.fn(),
  };
  const { result } = renderHook(() => useNotesWorkspaceScreen());

  await act(() => result.current.send({ type: 'entry.activated', entry: first }));
  await act(() => result.current.send({ type: 'document-session.changed', session }));
  await act(() => result.current.send({ type: 'entry.rename-requested', entry: first }));
  await act(() => result.current.send({ type: 'name.submitted', name: 'renamed' }));

  await waitFor(() => expect(result.current.view.selectedEntry?.relative_path).toBe('renamed.md'));
  expect(session.rename).toHaveBeenCalledWith('renamed.md');
  expect(workspace.renameNote.mutateAsync).not.toHaveBeenCalled();
  expect(workspace.refreshNotes).toHaveBeenCalledOnce();
});
