// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';

import NotesPanel from './NotesPanel';

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
  ]),
  createNoteApi: vi.fn(),
  deleteNoteFileApi: vi.fn(),
}));

vi.mock('./NoteEditor', () => ({ default: () => <div>笔记内容</div> }));

afterEach(cleanup);

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
