// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { open } from '@tauri-apps/plugin-dialog';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppSettings } from '@/lib/invoke';
import SettingsPage from './SettingsPage';
import {
  applyBookmarkImportApi,
  getSettingsApi,
  previewBookmarkImportApi,
  updateSettingsApi,
} from './settings.api';

vi.mock('@tauri-apps/plugin-dialog', () => ({ open: vi.fn(), save: vi.fn() }));
vi.mock('./settings.api', () => ({
  SettingsQueryApiKey: { SYSTEM_INFO: 'systemInfo', SETTINGS: 'settings' },
  getSettingsApi: vi.fn(),
  getSystemInfoApi: vi.fn(),
  updateSettingsApi: vi.fn(),
  exportBookmarksApi: vi.fn(),
  previewBookmarkImportApi: vi.fn(),
  applyBookmarkImportApi: vi.fn(),
}));

const baseSettings = (): AppSettings => ({
  common: {
    paths: {
      bookmark_export_dir: '/old/backup',
      todo_export_dir: '/old/todos',
      notes_dir: '/old/notes',
    },
  },
  services: {
    rsshub: { base_url: null, access_key: null },
    niutrans: { app_id: null, api_key: null },
  },
});

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

async function selectTab(name: '通用' | '服务' | '关于') {
  fireEvent.click(await screen.findByRole('tab', { name }));
}

describe('SettingsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getSettingsApi).mockResolvedValue(baseSettings());
    vi.mocked(updateSettingsApi).mockResolvedValue(undefined);
  });
  afterEach(cleanup);

  it('only exposes general, services, and about tabs', async () => {
    renderPage();
    expect(await screen.findByRole('tab', { name: '通用', selected: true })).toBeTruthy();
    expect(screen.getAllByRole('tab').map((tab) => tab.textContent)).toEqual([
      '通用',
      '服务',
      '关于',
    ]);
    expect(await screen.findByText('/old/backup')).toBeTruthy();
    expect(screen.getByText('/old/todos')).toBeTruthy();
    expect(screen.getByText('/old/notes')).toBeTruthy();
  });

  it('edits and saves one path without changing the others', async () => {
    renderPage();
    await screen.findByText('/old/backup');
    fireEvent.click(screen.getByRole('button', { name: '编辑Todo 导出目录' }));
    const input = screen.getByPlaceholderText('选择 Todo 默认导出目录');
    fireEvent.change(input, { target: { value: '/new/todos' } });
    fireEvent.click(screen.getByRole('button', { name: '保存Todo 导出目录' }));

    await waitFor(() =>
      expect(vi.mocked(updateSettingsApi)).toHaveBeenCalledWith({
        ...baseSettings(),
        common: { paths: { ...baseSettings().common.paths, todo_export_dir: '/new/todos' } },
      }),
    );
  });

  it('supports directory browsing, Escape cancellation, and inline errors', async () => {
    vi.mocked(open).mockResolvedValue('/chosen/notes');
    renderPage();
    await screen.findByText('/old/notes');
    fireEvent.click(screen.getByRole('button', { name: '编辑Obsidian 笔记' }));
    fireEvent.click(screen.getByRole('button', { name: '浏览Obsidian 笔记' }));
    await waitFor(() => expect(screen.getByDisplayValue('/chosen/notes')).toBeTruthy());
    fireEvent.keyDown(screen.getByDisplayValue('/chosen/notes'), { key: 'Escape' });
    expect(screen.getByText('/old/notes')).toBeTruthy();

    vi.mocked(updateSettingsApi).mockRejectedValueOnce(new Error('无法写入设置'));
    fireEvent.click(screen.getByRole('button', { name: '编辑书签导出目录' }));
    fireEvent.click(screen.getByRole('button', { name: '保存书签导出目录' }));
    expect(await screen.findByText('保存失败：无法写入设置')).toBeTruthy();
  });

  it('keeps bookmark import and export actions on the general tab', async () => {
    vi.mocked(open).mockResolvedValue('/tmp/bookmarks.json');
    vi.mocked(previewBookmarkImportApi).mockResolvedValue({
      file_hash: 'hash',
      total: 1,
      create_count: 1,
      update_count: 0,
      skip_count: 0,
    });
    vi.mocked(applyBookmarkImportApi).mockResolvedValue({
      file_hash: 'hash',
      total: 1,
      create_count: 1,
      update_count: 0,
      skip_count: 0,
    });
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: '导入 JSON' }));
    expect(await screen.findByRole('heading', { name: '确认导入书签？' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '确认导入' }));
    await waitFor(() =>
      expect(vi.mocked(applyBookmarkImportApi)).toHaveBeenCalledWith({
        path: '/tmp/bookmarks.json',
        fileHash: 'hash',
      }),
    );
  });

  it('manages RSSHub from the services tab', async () => {
    renderPage();
    await selectTab('服务');
    expect(screen.getByRole('heading', { name: 'RSSHub' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '编辑 RSSHub 服务' }));
    fireEvent.change(screen.getByLabelText('RSSHub 服务地址'), {
      target: { value: 'https://rss.example.com/' },
    });
    fireEvent.change(screen.getByLabelText('Access Key（可选）'), { target: { value: 'secret' } });
    fireEvent.click(screen.getByRole('button', { name: '保存 RSSHub 设置' }));
    await waitFor(() =>
      expect(vi.mocked(updateSettingsApi)).toHaveBeenCalledWith({
        ...baseSettings(),
        services: {
          ...baseSettings().services,
          rsshub: { base_url: 'https://rss.example.com', access_key: 'secret' },
        },
      }),
    );
  });

  it('switches services without losing an unsaved RSSHub draft', async () => {
    renderPage();
    await selectTab('服务');
    fireEvent.click(screen.getByRole('button', { name: '编辑 RSSHub 服务' }));
    fireEvent.change(screen.getByLabelText('RSSHub 服务地址'), {
      target: { value: 'https://draft.example.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: '选择小牛翻译服务' }));
    fireEvent.click(screen.getByRole('button', { name: '编辑小牛翻译服务' }));
    fireEvent.change(screen.getByLabelText('App ID'), { target: { value: 'app-id' } });
    fireEvent.click(screen.getByRole('button', { name: '选择 RSSHub 服务' }));
    expect((screen.getByLabelText('RSSHub 服务地址') as HTMLInputElement).value).toBe(
      'https://draft.example.com',
    );
    expect(screen.getByTitle('服务有未保存的更改')).toBeTruthy();
  });
});
