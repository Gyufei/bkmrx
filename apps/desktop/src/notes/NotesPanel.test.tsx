// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';

import NotesPanel from './NotesPanel';

const renameNoteFileApi = vi.hoisted(() => vi.fn());
const deleteNoteFileApi = vi.hoisted(() => vi.fn());

vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn().mockResolvedValue(() => undefined),
}));

vi.mock('@/settings/settings.api', () => ({
  SettingsQueryApiKey: { SETTINGS: 'settings' },
  getSettingsApi: vi.fn().mockResolvedValue({ notes_dir: '/notes' }),
}));

vi.mock('./notes.api', () => ({
  NotesQueryApiKey: { NOTES: 'notes' },
  scanNotesDirectoryApi: vi.fn().mockResolvedValue([
    {
      path: '/notes/first.md',
      relative_path: 'first.md',
      title: '第一篇笔记',
      tags: [],
      modified: 0,
      size: 0,
    },
    {
      path: '/notes/second.md',
      relative_path: 'second.md',
      title: '第二篇笔记',
      tags: [],
      modified: 0,
      size: 0,
    },
    {
      path: '/notes/资料/nested.md',
      relative_path: '资料/nested.md',
      title: '资料笔记',
      tags: [],
      modified: 0,
      size: 0,
    },
  ]),
  createNoteApi: vi.fn(),
  deleteNoteFileApi,
  renameNoteFileApi,
}));

vi.mock('./NoteEditor', () => ({ default: () => <div>笔记内容</div> }));

afterEach(() => {
  cleanup();
  localStorage.clear();
});

it('uses sidebar backgrounds for both navigation columns and the content background for the editor', async () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={queryClient}>
      <NotesPanel />
    </QueryClientProvider>,
  );

  const firstNote = await screen.findByRole('button', { name: '第一篇笔记' });
  const folderColumn = screen.getByText('共 3 篇笔记').closest('.bg-sidebar');
  const noteColumn = firstNote.closest('.bg-sidebar');

  expect(folderColumn).not.toBeNull();
  expect(noteColumn).not.toBeNull();

  fireEvent.click(firstNote);
  expect(
    (await screen.findByText('笔记内容')).parentElement?.classList.contains('bg-background'),
  ).toBe(true);
});

it('restores the selected folder when returning to the notes page', async () => {
  const firstRender = render(
    <QueryClientProvider client={new QueryClient()}>
      <NotesPanel />
    </QueryClientProvider>,
  );

  const folder = await screen.findByRole('button', { name: '资料' });
  fireEvent.click(folder);
  expect(folder.classList.contains('bg-primary/15')).toBe(true);

  firstRender.unmount();
  render(
    <QueryClientProvider client={new QueryClient()}>
      <NotesPanel />
    </QueryClientProvider>,
  );

  const restoredFolder = await screen.findByRole('button', { name: '资料' });
  await waitFor(() => expect(restoredFolder.classList.contains('bg-primary/15')).toBe(true));
});

it('uses the same primary-tinted selection background as the folder column', async () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={queryClient}>
      <NotesPanel />
    </QueryClientProvider>,
  );
  const firstNote = await screen.findByRole('button', { name: '第一篇笔记' });
  const secondNote = screen.getByRole('button', { name: '第二篇笔记' });

  fireEvent.click(firstNote);

  expect(firstNote.classList.contains('bg-primary/15')).toBe(true);
  expect(secondNote.classList.contains('bg-primary/15')).toBe(false);
});

it('renames a note from its context menu using the file dialog', async () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={queryClient}>
      <NotesPanel />
    </QueryClientProvider>,
  );
  const firstNote = await screen.findByRole('button', { name: '第一篇笔记' });

  fireEvent.contextMenu(firstNote);
  fireEvent.click(await screen.findByText('重命名'));

  const fileNameInput = screen.getByDisplayValue('第一篇笔记');
  expect(screen.getByLabelText('文件名')).toBe(fileNameInput);
  fireEvent.change(fileNameInput, { target: { value: '改名后的笔记' } });
  fireEvent.click(screen.getByRole('button', { name: '确定' }));

  await waitFor(() => {
    expect(renameNoteFileApi.mock.calls[0]?.[0]).toEqual({
      oldPath: '/notes/first.md',
      newPath: '/notes/改名后的笔记.md',
    });
  });
});

it('requires confirmation before deleting a note', async () => {
  deleteNoteFileApi.mockResolvedValue(undefined);
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={queryClient}>
      <NotesPanel />
    </QueryClientProvider>,
  );
  const firstNote = await screen.findByRole('button', { name: '第一篇笔记' });

  fireEvent.contextMenu(firstNote);
  fireEvent.click(await screen.findByText('删除笔记'));

  expect(deleteNoteFileApi).not.toHaveBeenCalled();
  expect(await screen.findByText('删除笔记“第一篇笔记”？')).toBeTruthy();

  fireEvent.click(screen.getByRole('button', { name: '取消' }));
  expect(deleteNoteFileApi).not.toHaveBeenCalled();

  fireEvent.contextMenu(firstNote);
  fireEvent.click(await screen.findByText('删除笔记'));
  fireEvent.click(screen.getByRole('button', { name: '删除' }));

  await waitFor(() => expect(deleteNoteFileApi).toHaveBeenCalledOnce());
  expect(deleteNoteFileApi).toHaveBeenCalledWith('/notes/first.md');
});

it('clears a previous deletion error before opening another note', async () => {
  deleteNoteFileApi.mockRejectedValueOnce(new Error('文件被占用'));
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={queryClient}>
      <NotesPanel />
    </QueryClientProvider>,
  );

  const firstNote = await screen.findByRole('button', { name: '第一篇笔记' });
  fireEvent.contextMenu(firstNote);
  fireEvent.click(await screen.findByText('删除笔记'));
  fireEvent.click(screen.getByRole('button', { name: '删除' }));
  expect(await screen.findByText('删除失败：文件被占用')).toBeTruthy();

  fireEvent.click(screen.getByRole('button', { name: '取消' }));
  const secondNote = screen.getByRole('button', { name: '第二篇笔记' });
  fireEvent.contextMenu(secondNote);
  fireEvent.click(await screen.findByText('删除笔记'));

  expect(screen.queryByText('删除失败：文件被占用')).toBeNull();
  expect(screen.getByText('删除笔记“第二篇笔记”？')).toBeTruthy();
});
