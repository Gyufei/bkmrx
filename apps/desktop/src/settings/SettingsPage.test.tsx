// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { open } from '@tauri-apps/plugin-dialog';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import SettingsPage from './SettingsPage';
import {
  applyBookmarkImportApi,
  previewBookmarkImportApi,
  updateSettingsApi,
} from './settings.api';

vi.mock('@tauri-apps/plugin-dialog', () => ({
  open: vi.fn(),
  save: vi.fn(),
}));

vi.mock('./settings.api', () => ({
  SettingsQueryApiKey: {
    SYSTEM_INFO: 'systemInfo',
    SETTINGS: 'settings',
  },
  getSettingsApi: vi.fn().mockResolvedValue({
    backup_dir: '/old/backup',
    notes_dir: '/old/notes',
  }),
  getSystemInfoApi: vi.fn().mockResolvedValue({
    app_data_dir: '/app',
    sqlite_db_path: '/app/bookmarks.db',
    schema_version: 1,
    search_backend: 'sqlite_fts5_trigram',
    app_version: '0.1.0',
  }),
  updateSettingsApi: vi.fn().mockResolvedValue(undefined),
  exportBookmarksApi: vi.fn(),
  previewBookmarkImportApi: vi.fn(),
  applyBookmarkImportApi: vi.fn(),
}));

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return {
    ...render(
      <QueryClientProvider client={queryClient}>
        <SettingsPage />
      </QueryClientProvider>,
    ),
    queryClient,
  };
}

describe('SettingsPage', () => {
  afterEach(cleanup);

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(updateSettingsApi).mockResolvedValue(undefined);
  });

  it('shows complete path text until the user starts editing', async () => {
    renderPage();
    expect(await screen.findByText('/old/backup')).toBeTruthy();
    expect(screen.getByText('/old/notes')).toBeTruthy();
    expect(screen.queryByPlaceholderText('/Users/me/CloudDrive/bookmarks')).toBeNull();
    expect(screen.queryByPlaceholderText('输入 Obsidian 笔记目录路径')).toBeNull();
    expect(screen.getAllByRole('button', { name: '编辑' })).toHaveLength(2);
  });

  it('edits and saves the backup directory in place', async () => {
    renderPage();
    await screen.findByText('/old/backup');
    fireEvent.click(screen.getAllByRole('button', { name: '编辑' })[0]);

    const input = screen.getByPlaceholderText('/Users/me/CloudDrive/bookmarks');
    expect((input as HTMLInputElement).value).toBe('/old/backup');
    expect((screen.getByRole('button', { name: '编辑' }) as HTMLButtonElement).disabled).toBe(true);

    fireEvent.change(input, { target: { value: '/new/backup' } });
    fireEvent.click(screen.getByRole('button', { name: '保存' }));

    await waitFor(() =>
      expect(vi.mocked(updateSettingsApi).mock.calls[0]?.[0]).toEqual({
        backup_dir: '/new/backup',
        notes_dir: '/old/notes',
      }),
    );
    await waitFor(() =>
      expect(screen.queryByPlaceholderText('/Users/me/CloudDrive/bookmarks')).toBeNull(),
    );
  });

  it('edits and saves the notes directory in place', async () => {
    renderPage();
    await screen.findByText('/old/notes');
    fireEvent.click(screen.getAllByRole('button', { name: '编辑' })[1]);

    const input = screen.getByPlaceholderText('输入 Obsidian 笔记目录路径');
    fireEvent.change(input, { target: { value: '/new/notes' } });
    fireEvent.click(screen.getByRole('button', { name: '保存' }));

    await waitFor(() =>
      expect(vi.mocked(updateSettingsApi).mock.calls[0]?.[0]).toEqual({
        backup_dir: '/old/backup',
        notes_dir: '/new/notes',
      }),
    );
  });

  it('cancels an in-place edit without saving the draft', async () => {
    renderPage();
    await screen.findByText('/old/backup');
    fireEvent.click(screen.getAllByRole('button', { name: '编辑' })[0]);

    const input = screen.getByPlaceholderText('/Users/me/CloudDrive/bookmarks');
    fireEvent.change(input, { target: { value: '/discarded/backup' } });
    fireEvent.click(screen.getByRole('button', { name: '取消' }));

    expect(screen.getByText('/old/backup')).toBeTruthy();
    expect(vi.mocked(updateSettingsApi)).not.toHaveBeenCalled();
  });

  it('saves with Enter and cancels with Escape', async () => {
    renderPage();
    await screen.findByText('/old/backup');
    fireEvent.click(screen.getAllByRole('button', { name: '编辑' })[0]);

    const backupInput = screen.getByPlaceholderText('/Users/me/CloudDrive/bookmarks');
    fireEvent.change(backupInput, { target: { value: '/enter/backup' } });
    fireEvent.keyDown(backupInput, { key: 'Enter' });

    await waitFor(() =>
      expect(vi.mocked(updateSettingsApi).mock.calls[0]?.[0]).toEqual({
        backup_dir: '/enter/backup',
        notes_dir: '/old/notes',
      }),
    );
    await waitFor(() =>
      expect(screen.queryByPlaceholderText('/Users/me/CloudDrive/bookmarks')).toBeNull(),
    );

    fireEvent.click(screen.getAllByRole('button', { name: '编辑' })[1]);
    const notesInput = screen.getByPlaceholderText('输入 Obsidian 笔记目录路径');
    fireEvent.change(notesInput, { target: { value: '/discarded/notes' } });
    fireEvent.keyDown(notesInput, { key: 'Escape' });

    expect(screen.queryByPlaceholderText('输入 Obsidian 笔记目录路径')).toBeNull();
    expect(screen.getByText('/old/notes')).toBeTruthy();
  });

  it('keeps the directory editor open and shows an error when saving fails', async () => {
    vi.mocked(updateSettingsApi).mockRejectedValueOnce(new Error('无法写入设置'));
    renderPage();
    await screen.findByText('/old/backup');
    fireEvent.click(screen.getAllByRole('button', { name: '编辑' })[0]);
    fireEvent.click(screen.getByRole('button', { name: '保存' }));

    expect(await screen.findByText('保存失败：无法写入设置')).toBeTruthy();
    expect(screen.getByLabelText('默认备份目录').getAttribute('aria-invalid')).toBe('true');
  });

  it('previews and applies an import, then invalidates bookmark queries', async () => {
    vi.mocked(open).mockResolvedValue('/tmp/bookmarks.json');
    vi.mocked(previewBookmarkImportApi).mockResolvedValue({
      file_hash: 'hash',
      total: 3,
      create_count: 1,
      update_count: 1,
      skip_count: 1,
    });
    vi.mocked(applyBookmarkImportApi).mockResolvedValue({
      file_hash: 'hash',
      total: 3,
      create_count: 1,
      update_count: 1,
      skip_count: 1,
    });
    const { queryClient } = renderPage();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    fireEvent.click(await screen.findByRole('button', { name: '导入 JSON' }));
    expect(await screen.findByRole('heading', { name: '确认导入书签？' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '确认导入' }));

    await waitFor(() =>
      expect(vi.mocked(applyBookmarkImportApi).mock.calls[0]?.[0]).toEqual({
        path: '/tmp/bookmarks.json',
        fileHash: 'hash',
      }),
    );
    await waitFor(() => {
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['bookmarks'] });
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['tags'] });
    });
  });
});
