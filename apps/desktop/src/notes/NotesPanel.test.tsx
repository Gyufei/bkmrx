// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';

import NotesPanel from './NotesPanel';

const renameNoteFileApi = vi.hoisted(() => vi.fn());
const deleteNoteFileApi = vi.hoisted(() => vi.fn());
const deleteNoteFolderApi = vi.hoisted(() => vi.fn());
const openExternalNoteFileApi = vi.hoisted(() => vi.fn());
const activeDocumentSession = vi.hoisted(() => ({
  flush: vi.fn().mockResolvedValue(undefined),
  rename: vi.fn(),
  delete: vi.fn(),
}));

vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn().mockResolvedValue(() => undefined),
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
  scanNotesDirectoryApi: vi.fn().mockResolvedValue({
    revision: 1,
    notes: [
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
    ],
    root: {
      name: 'notes',
      relative_path: '',
      files: [
        { name: '第一篇笔记.md', relative_path: 'first.md', kind: 'markdown' },
        { name: '第二篇笔记.md', relative_path: 'second.md', kind: 'markdown' },
        { name: 'reference.HTML', relative_path: 'reference.HTML', kind: 'external' },
        { name: 'data.json', relative_path: 'data.json', kind: 'external' },
        { name: 'script.mjs', relative_path: 'script.mjs', kind: 'external' },
        { name: 'component.jsx', relative_path: 'component.jsx', kind: 'external' },
      ],
      directories: [
        {
          name: '空目录',
          relative_path: '空目录',
          files: [],
          directories: [],
        },
        {
          name: '资料',
          relative_path: '资料',
          files: [{ name: '资料笔记.md', relative_path: '资料/nested.md', kind: 'markdown' }],
          directories: [
            {
              name: '二级',
              relative_path: '资料/二级',
              files: [
                { name: 'deep.json', relative_path: '资料/二级/deep.json', kind: 'external' },
              ],
              directories: [],
            },
          ],
        },
      ],
    },
  }),
  createNoteApi: vi.fn(),
  deleteNoteFileApi,
  deleteNoteFolderApi,
  openExternalNoteFileApi,
  renameNoteFileApi,
}));

vi.mock('./NoteEditor', async () => {
  const { useEffect } = await import('react');
  return {
    default: ({
      filePath,
      onSessionChange,
    }: {
      filePath: string;
      onSessionChange?: (session: unknown) => void;
    }) => {
      useEffect(() => {
        onSessionChange?.(activeDocumentSession);
        return () => onSessionChange?.(null);
      }, [onSessionChange]);
      return (
        <div data-testid="note-editor" data-file-path={filePath}>
          笔记内容
        </div>
      );
    },
  };
});

afterEach(() => {
  cleanup();
  localStorage.clear();
  activeDocumentSession.flush.mockClear();
  activeDocumentSession.rename.mockReset();
  activeDocumentSession.delete.mockReset();
  openExternalNoteFileApi.mockReset();
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

  const firstNote = await screen.findByRole('button', { name: '第一篇笔记.md' });
  const folderColumn = screen.getByText('笔记').closest('.bg-sidebar');
  const noteColumn = firstNote.closest('.bg-sidebar');

  expect(folderColumn).not.toBeNull();
  expect(noteColumn).not.toBeNull();

  fireEvent.click(firstNote);
  expect(
    (await screen.findByText('笔记内容')).parentElement?.classList.contains('bg-background'),
  ).toBe(true);
});

it('shows the real root and only the selected directory direct files', async () => {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <NotesPanel />
    </QueryClientProvider>,
  );

  expect(await screen.findByRole('button', { name: 'notes' })).toBeTruthy();
  expect(screen.getByText('共 6 个文件')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'reference.HTML' })).toBeTruthy();
  expect(screen.getByRole('button', { name: '空目录' })).toBeTruthy();

  fireEvent.click(screen.getByRole('button', { name: '资料' }));

  expect(await screen.findByText('共 1 个文件')).toBeTruthy();
  expect(screen.getByRole('button', { name: '资料笔记.md' })).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'deep.json' })).toBeNull();
});

it('keeps the active Markdown document when an external file is clicked', async () => {
  openExternalNoteFileApi.mockResolvedValue(undefined);
  render(
    <QueryClientProvider client={new QueryClient()}>
      <NotesPanel />
    </QueryClientProvider>,
  );
  fireEvent.click(await screen.findByRole('button', { name: '第一篇笔记.md' }));
  await screen.findByTestId('note-editor');

  fireEvent.click(screen.getByRole('button', { name: 'reference.HTML' }));

  expect(screen.getByTestId('note-editor').getAttribute('data-file-path')).toBe('first.md');
  expect(activeDocumentSession.flush).not.toHaveBeenCalled();
  await waitFor(() => expect(openExternalNoteFileApi).toHaveBeenCalledWith(1, 'reference.HTML'));
});

it('reports an external open failure without exposing a path or changing the editor', async () => {
  openExternalNoteFileApi.mockRejectedValueOnce(new Error('系统没有可用应用'));
  render(
    <QueryClientProvider client={new QueryClient()}>
      <NotesPanel />
    </QueryClientProvider>,
  );
  fireEvent.click(await screen.findByRole('button', { name: '第一篇笔记.md' }));
  fireEvent.click(screen.getByRole('button', { name: 'reference.HTML' }));

  expect(await screen.findByText('无法打开“reference.HTML”：系统没有可用应用')).toBeTruthy();
  expect(screen.getByTestId('note-editor').getAttribute('data-file-path')).toBe('first.md');
  expect(activeDocumentSession.flush).not.toHaveBeenCalled();

  fireEvent.click(screen.getByRole('button', { name: 'data.json' }));
  await waitFor(() =>
    expect(screen.queryByText('无法打开“reference.HTML”：系统没有可用应用')).toBeNull(),
  );
});

it('does not expose Markdown rename or delete actions for external files', async () => {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <NotesPanel />
    </QueryClientProvider>,
  );
  const externalFile = await screen.findByRole('button', { name: 'reference.HTML' });

  fireEvent.contextMenu(externalFile);

  expect(await screen.findByRole('menuitem', { name: '复制文件路径' })).toBeTruthy();
  expect(screen.queryByRole('menuitem', { name: '重命名' })).toBeNull();
  expect(screen.queryByRole('menuitem', { name: '删除笔记' })).toBeNull();
});

it('falls back from a missing selected directory to its nearest existing parent', async () => {
  localStorage.setItem('bkmrx:notes:selected-folder:/notes', '资料/已删除');
  render(
    <QueryClientProvider client={new QueryClient()}>
      <NotesPanel />
    </QueryClientProvider>,
  );

  const folder = await screen.findByRole('button', { name: '资料' });
  await waitFor(() => expect(folder.classList.contains('bg-primary/15')).toBe(true));
  expect(screen.getByRole('button', { name: '资料笔记.md' })).toBeTruthy();
  expect(localStorage.getItem('bkmrx:notes:selected-folder:/notes')).toBe('资料');
});

it('searches complete direct filenames while keeping extensions hidden', async () => {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <NotesPanel />
    </QueryClientProvider>,
  );
  const externalFile = await screen.findByRole('button', { name: 'reference.HTML' });
  expect(externalFile.textContent).toContain('reference');
  expect(externalFile.textContent).not.toContain('.HTML');
  expect(externalFile.querySelector('[data-file-kind="html"]')).not.toBeNull();

  fireEvent.change(screen.getByPlaceholderText('搜索文件...'), { target: { value: 'html' } });

  expect(screen.getByRole('button', { name: 'reference.HTML' })).toBeTruthy();
  expect(screen.queryByRole('button', { name: '第一篇笔记.md' })).toBeNull();
});

it('distinguishes the supported file icon categories by extension', async () => {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <NotesPanel />
    </QueryClientProvider>,
  );

  expect(
    (await screen.findByRole('button', { name: '第一篇笔记.md' })).querySelector(
      '[data-file-kind="markdown"]',
    ),
  ).not.toBeNull();
  expect(
    screen.getByRole('button', { name: 'reference.HTML' }).querySelector('[data-file-kind="html"]'),
  ).not.toBeNull();
  expect(
    screen.getByRole('button', { name: 'data.json' }).querySelector('[data-file-kind="json"]'),
  ).not.toBeNull();
  expect(
    screen
      .getByRole('button', { name: 'script.mjs' })
      .querySelector('[data-file-kind="javascript"]'),
  ).not.toBeNull();
  expect(
    screen
      .getByRole('button', { name: 'component.jsx' })
      .querySelector('[data-file-kind="unknown"]'),
  ).not.toBeNull();
  const htmlIcon = screen
    .getByRole('button', { name: 'reference.HTML' })
    .querySelector('[data-file-kind="html"]');
  const javascriptIcon = screen
    .getByRole('button', { name: 'script.mjs' })
    .querySelector('[data-file-kind="javascript"]');
  expect(htmlIcon?.getAttribute('class')).not.toBe(javascriptIcon?.getAttribute('class'));
});

it('restores the selected folder when returning to the notes page', async () => {
  const firstRender = render(
    <QueryClientProvider client={new QueryClient()}>
      <NotesPanel />
    </QueryClientProvider>,
  );

  const folder = await screen.findByRole('button', { name: '资料' });
  fireEvent.click(folder);
  await waitFor(() => expect(folder.classList.contains('bg-primary/15')).toBe(true));

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
  const firstNote = await screen.findByRole('button', { name: '第一篇笔记.md' });
  const secondNote = screen.getByRole('button', { name: '第二篇笔记.md' });

  fireEvent.click(firstNote);

  await waitFor(() => expect(firstNote.classList.contains('bg-primary/15')).toBe(true));
  expect(secondNote.classList.contains('bg-primary/15')).toBe(false);
});

it('keeps the active note selected and reports an error when navigation flush fails', async () => {
  activeDocumentSession.flush.mockRejectedValueOnce(new Error('磁盘已满'));
  render(
    <QueryClientProvider client={new QueryClient()}>
      <NotesPanel />
    </QueryClientProvider>,
  );
  const firstNote = await screen.findByRole('button', { name: '第一篇笔记.md' });
  const secondNote = screen.getByRole('button', { name: '第二篇笔记.md' });
  fireEvent.click(firstNote);
  await screen.findByTestId('note-editor');

  fireEvent.click(secondNote);

  expect(await screen.findByText('无法切换笔记：磁盘已满')).toBeTruthy();
  expect(screen.getByTestId('note-editor').getAttribute('data-file-path')).toBe('first.md');
  expect(activeDocumentSession.flush).toHaveBeenCalledOnce();
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
  const firstNote = await screen.findByRole('button', { name: '第一篇笔记.md' });

  fireEvent.contextMenu(firstNote);
  fireEvent.click(await screen.findByText('重命名'));

  const fileNameInput = screen.getByDisplayValue('第一篇笔记');
  expect(screen.getByLabelText('文件名')).toBe(fileNameInput);
  fireEvent.change(fileNameInput, { target: { value: '改名后的笔记' } });
  fireEvent.click(screen.getByRole('button', { name: '确定' }));

  await waitFor(() => {
    expect(renameNoteFileApi.mock.calls[0]?.[0]).toEqual({
      revision: 1,
      relativePath: 'first.md',
      name: '改名后的笔记.md',
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
  const firstNote = await screen.findByRole('button', { name: '第一篇笔记.md' });

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
  expect(deleteNoteFileApi).toHaveBeenCalledWith(1, 'first.md');
});

it('requires confirmation before deleting a folder', async () => {
  deleteNoteFolderApi.mockResolvedValue(undefined);
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={queryClient}>
      <NotesPanel />
    </QueryClientProvider>,
  );
  const folder = await screen.findByRole('button', { name: '资料' });

  fireEvent.contextMenu(folder);
  fireEvent.click(await screen.findByRole('menuitem', { name: '删除' }));

  expect(deleteNoteFolderApi).not.toHaveBeenCalled();
  expect(await screen.findByText('删除文件夹“资料”？')).toBeTruthy();

  fireEvent.click(screen.getByRole('button', { name: '取消' }));
  expect(deleteNoteFolderApi).not.toHaveBeenCalled();

  fireEvent.contextMenu(folder);
  fireEvent.click(await screen.findByRole('menuitem', { name: '删除' }));
  fireEvent.click(screen.getByRole('button', { name: '删除' }));

  await waitFor(() => expect(deleteNoteFolderApi).toHaveBeenCalledOnce());
  expect(deleteNoteFolderApi).toHaveBeenCalledWith(1, '资料');
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

  const firstNote = await screen.findByRole('button', { name: '第一篇笔记.md' });
  fireEvent.contextMenu(firstNote);
  fireEvent.click(await screen.findByText('删除笔记'));
  fireEvent.click(screen.getByRole('button', { name: '删除' }));
  expect(await screen.findByText('删除失败：文件被占用')).toBeTruthy();

  fireEvent.click(screen.getByRole('button', { name: '取消' }));
  const secondNote = screen.getByRole('button', { name: '第二篇笔记.md' });
  fireEvent.contextMenu(secondNote);
  fireEvent.click(await screen.findByText('删除笔记'));

  expect(screen.queryByText('删除失败：文件被占用')).toBeNull();
  expect(screen.getByText('删除笔记“第二篇笔记”？')).toBeTruthy();
});

it('shows an active document rename failure in the name dialog', async () => {
  activeDocumentSession.rename.mockRejectedValueOnce(new Error('笔记已在外部修改'));
  render(
    <QueryClientProvider client={new QueryClient()}>
      <NotesPanel />
    </QueryClientProvider>,
  );

  const firstNote = await screen.findByRole('button', { name: '第一篇笔记.md' });
  fireEvent.click(firstNote);
  fireEvent.contextMenu(firstNote);
  fireEvent.click(await screen.findByText('重命名'));
  fireEvent.change(screen.getByLabelText('文件名'), { target: { value: '新名字' } });
  fireEvent.click(screen.getByRole('button', { name: '确定' }));

  expect(await screen.findByText('笔记已在外部修改')).toBeTruthy();
});

it('shows an active document deletion failure in the confirmation dialog', async () => {
  activeDocumentSession.delete.mockRejectedValueOnce(new Error('笔记已在外部修改'));
  render(
    <QueryClientProvider client={new QueryClient()}>
      <NotesPanel />
    </QueryClientProvider>,
  );

  const firstNote = await screen.findByRole('button', { name: '第一篇笔记.md' });
  fireEvent.click(firstNote);
  fireEvent.contextMenu(firstNote);
  fireEvent.click(await screen.findByText('删除笔记'));
  fireEvent.click(screen.getByRole('button', { name: '删除' }));

  expect(await screen.findByText('删除失败：笔记已在外部修改')).toBeTruthy();
});

it('keeps a successful active rename when refreshing the note list fails', async () => {
  activeDocumentSession.rename.mockResolvedValueOnce('renamed.md');
  const queryClient = new QueryClient();
  vi.spyOn(queryClient, 'invalidateQueries').mockRejectedValueOnce(new Error('refresh failed'));
  render(
    <QueryClientProvider client={queryClient}>
      <NotesPanel />
    </QueryClientProvider>,
  );

  const firstNote = await screen.findByRole('button', { name: '第一篇笔记.md' });
  fireEvent.click(firstNote);
  fireEvent.contextMenu(firstNote);
  fireEvent.click(await screen.findByText('重命名'));
  fireEvent.change(screen.getByLabelText('文件名'), { target: { value: '新名字' } });
  fireEvent.click(screen.getByRole('button', { name: '确定' }));

  await waitFor(() =>
    expect(screen.getByTestId('note-editor').getAttribute('data-file-path')).toBe('renamed.md'),
  );
  expect(screen.queryByText('重命名笔记')).toBeNull();
});

it('closes a successfully deleted active document when refreshing the note list fails', async () => {
  activeDocumentSession.delete.mockResolvedValueOnce(undefined);
  const queryClient = new QueryClient();
  vi.spyOn(queryClient, 'invalidateQueries').mockRejectedValueOnce(new Error('refresh failed'));
  render(
    <QueryClientProvider client={queryClient}>
      <NotesPanel />
    </QueryClientProvider>,
  );

  const firstNote = await screen.findByRole('button', { name: '第一篇笔记.md' });
  fireEvent.click(firstNote);
  fireEvent.contextMenu(firstNote);
  fireEvent.click(await screen.findByText('删除笔记'));
  fireEvent.click(screen.getByRole('button', { name: '删除' }));

  await waitFor(() => expect(screen.queryByTestId('note-editor')).toBeNull());
  expect(screen.queryByText('删除笔记“第一篇笔记”？')).toBeNull();
});
