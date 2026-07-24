// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import SettingsPage from './SettingsPage';
import { updateSettingsApi } from './settings.api';

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
  return render(
    <QueryClientProvider client={queryClient}>
      <SettingsPage />
    </QueryClientProvider>,
  );
}

describe('SettingsPage', () => {
  afterEach(cleanup);

  beforeEach(() => {
    vi.mocked(updateSettingsApi).mockClear();
  });

  it.each([0, 1])('save button %i submits both current fields', async (buttonIndex) => {
    renderPage();
    const backupInput = await screen.findByPlaceholderText('/Users/me/CloudDrive/bookmarks');
    const notesInput = await screen.findByPlaceholderText('输入 Obsidian 笔记目录路径');
    await waitFor(() => expect((backupInput as HTMLInputElement).value).toBe('/old/backup'));

    fireEvent.change(backupInput, { target: { value: '/new/backup' } });
    fireEvent.change(notesInput, { target: { value: '/new/notes' } });
    fireEvent.click(screen.getAllByRole('button', { name: '保存' })[buttonIndex]);

    await waitFor(() =>
      expect(vi.mocked(updateSettingsApi).mock.calls[0]?.[0]).toEqual({
        backup_dir: '/new/backup',
        notes_dir: '/new/notes',
      }),
    );
  });
});
