// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { open } from '@tauri-apps/plugin-dialog';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import SettingsPage from './SettingsPage';
import {
  applyBookmarkImportApi,
  getSettingsApi,
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
    common: {},
    bookmark: { backup_dir: '/old/backup' },
    note: { notes_dir: '/old/notes' },
    rss: { rsshub_base_url: null, rsshub_access_key: null },
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

async function selectTab(name: '通用' | '书签' | '笔记' | 'RSS' | '关于') {
  fireEvent.click(await screen.findByRole('tab', { name }));
}

describe('SettingsPage', () => {
  afterEach(cleanup);

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(updateSettingsApi).mockResolvedValue(undefined);
  });

  it('opens the general tab by default and switches between setting sections', async () => {
    renderPage();

    expect(await screen.findByRole('tab', { name: '通用', selected: true })).toBeTruthy();
    expect(screen.getByRole('heading', { name: '通用' })).toBeTruthy();

    await selectTab('书签');
    expect(screen.getByRole('heading', { name: '书签' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: '书签', selected: true })).toBeTruthy();
  });

  it('shows complete path text until the user starts editing', async () => {
    renderPage();
    await selectTab('书签');
    expect(await screen.findByText('/old/backup')).toBeTruthy();
    expect(screen.queryByPlaceholderText('/Users/me/CloudDrive/bookmarks')).toBeNull();
    expect(screen.getByRole('button', { name: '编辑' })).toBeTruthy();

    await selectTab('笔记');
    expect(screen.getByText('/old/notes')).toBeTruthy();
    expect(screen.queryByPlaceholderText('输入 Obsidian 笔记目录路径')).toBeNull();
  });

  it('edits and saves the backup directory in place', async () => {
    renderPage();
    await selectTab('书签');
    await screen.findByText('/old/backup');
    fireEvent.click(screen.getByRole('button', { name: '编辑' }));

    const input = screen.getByPlaceholderText('/Users/me/CloudDrive/bookmarks');
    expect((input as HTMLInputElement).value).toBe('/old/backup');
    fireEvent.change(input, { target: { value: '/new/backup' } });
    fireEvent.click(screen.getByRole('button', { name: '保存' }));

    await waitFor(() =>
      expect(vi.mocked(updateSettingsApi).mock.calls[0]?.[0]).toEqual({
        common: {},
        bookmark: { backup_dir: '/new/backup' },
        note: { notes_dir: '/old/notes' },
        rss: { rsshub_base_url: null, rsshub_access_key: null },
      }),
    );
    await waitFor(() =>
      expect(screen.queryByPlaceholderText('/Users/me/CloudDrive/bookmarks')).toBeNull(),
    );
  });

  it('edits and saves the notes directory in place', async () => {
    renderPage();
    await selectTab('笔记');
    await screen.findByText('/old/notes');
    fireEvent.click(screen.getByRole('button', { name: '编辑' }));

    const input = screen.getByPlaceholderText('输入 Obsidian 笔记目录路径');
    fireEvent.change(input, { target: { value: '/new/notes' } });
    fireEvent.click(screen.getByRole('button', { name: '保存' }));

    await waitFor(() =>
      expect(vi.mocked(updateSettingsApi).mock.calls[0]?.[0]).toEqual({
        common: {},
        bookmark: { backup_dir: '/old/backup' },
        note: { notes_dir: '/new/notes' },
        rss: { rsshub_base_url: null, rsshub_access_key: null },
      }),
    );
  });

  it('cancels an in-place edit without saving the draft', async () => {
    renderPage();
    await selectTab('书签');
    await screen.findByText('/old/backup');
    fireEvent.click(screen.getByRole('button', { name: '编辑' }));

    const input = screen.getByPlaceholderText('/Users/me/CloudDrive/bookmarks');
    fireEvent.change(input, { target: { value: '/discarded/backup' } });
    fireEvent.click(screen.getByRole('button', { name: '取消' }));

    expect(screen.getByText('/old/backup')).toBeTruthy();
    expect(vi.mocked(updateSettingsApi)).not.toHaveBeenCalled();
  });

  it('saves with Enter and cancels with Escape', async () => {
    renderPage();
    await selectTab('书签');
    await screen.findByText('/old/backup');
    fireEvent.click(screen.getByRole('button', { name: '编辑' }));

    const backupInput = screen.getByPlaceholderText('/Users/me/CloudDrive/bookmarks');
    fireEvent.change(backupInput, { target: { value: '/enter/backup' } });
    fireEvent.keyDown(backupInput, { key: 'Enter' });

    await waitFor(() =>
      expect(vi.mocked(updateSettingsApi).mock.calls[0]?.[0]).toEqual({
        common: {},
        bookmark: { backup_dir: '/enter/backup' },
        note: { notes_dir: '/old/notes' },
        rss: { rsshub_base_url: null, rsshub_access_key: null },
      }),
    );
    await waitFor(() =>
      expect(screen.queryByPlaceholderText('/Users/me/CloudDrive/bookmarks')).toBeNull(),
    );

    await selectTab('笔记');
    fireEvent.click(screen.getByRole('button', { name: '编辑' }));
    const notesInput = screen.getByPlaceholderText('输入 Obsidian 笔记目录路径');
    fireEvent.change(notesInput, { target: { value: '/discarded/notes' } });
    fireEvent.keyDown(notesInput, { key: 'Escape' });

    expect(screen.queryByPlaceholderText('输入 Obsidian 笔记目录路径')).toBeNull();
    expect(screen.getByText('/old/notes')).toBeTruthy();
  });

  it('saves an RSSHub service with an optional access key', async () => {
    renderPage();
    await selectTab('RSS');
    fireEvent.click(screen.getByRole('button', { name: '编辑 RSS 设置' }));
    const baseUrl = screen.getByLabelText('RSSHub 服务地址');
    fireEvent.change(baseUrl, { target: { value: 'https://rss.example.com/' } });
    fireEvent.change(screen.getByLabelText('Access Key（可选）'), {
      target: { value: 'secret' },
    });
    fireEvent.click(screen.getByRole('button', { name: '保存 RSS 设置' }));

    await waitFor(() =>
      expect(vi.mocked(updateSettingsApi).mock.calls[0]?.[0]).toEqual({
        common: {},
        bookmark: { backup_dir: '/old/backup' },
        note: { notes_dir: '/old/notes' },
        rss: {
          rsshub_base_url: 'https://rss.example.com',
          rsshub_access_key: 'secret',
        },
      }),
    );
  });

  it('masks the RSSHub key and can toggle its visibility while editing', async () => {
    vi.mocked(getSettingsApi).mockResolvedValueOnce({
      common: {},
      bookmark: { backup_dir: '/old/backup' },
      note: { notes_dir: '/old/notes' },
      rss: { rsshub_base_url: 'https://rss.example.com', rsshub_access_key: 'secret' },
    });
    renderPage();
    await selectTab('RSS');
    expect(screen.getByText('https://rss.example.com')).toBeTruthy();
    expect(screen.getByText('**********')).toBeTruthy();

    const editButton = screen.getByRole('button', { name: '编辑 RSS 设置' });
    expect(editButton.closest('[data-slot="card-header"]')).toBeTruthy();
    fireEvent.click(editButton);
    const keyInput = screen.getByLabelText('Access Key（可选）') as HTMLInputElement;
    fireEvent.change(keyInput, { target: { value: 'secret' } });
    expect(keyInput.type).toBe('password');
    fireEvent.click(screen.getByRole('button', { name: '显示 Access Key' }));
    expect(keyInput.type).toBe('text');
    fireEvent.click(screen.getByRole('button', { name: '隐藏 Access Key' }));
    expect(keyInput.type).toBe('password');
  });

  it('keeps the directory editor open and shows an error when saving fails', async () => {
    vi.mocked(updateSettingsApi).mockRejectedValueOnce(new Error('无法写入设置'));
    renderPage();
    await selectTab('书签');
    await screen.findByText('/old/backup');
    fireEvent.click(screen.getByRole('button', { name: '编辑' }));
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
    await selectTab('书签');

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

  it('keeps an unsaved RSS draft while switching tabs', async () => {
    renderPage();
    await selectTab('RSS');
    fireEvent.click(screen.getByRole('button', { name: '编辑 RSS 设置' }));
    fireEvent.change(screen.getByLabelText('RSSHub 服务地址'), {
      target: { value: 'https://draft.example.com' },
    });

    await selectTab('书签');
    await selectTab('RSS');

    expect((screen.getByLabelText('RSSHub 服务地址') as HTMLInputElement).value).toBe(
      'https://draft.example.com',
    );
    expect(screen.getByTitle('RSS有未保存的更改')).toBeTruthy();
  });
});
