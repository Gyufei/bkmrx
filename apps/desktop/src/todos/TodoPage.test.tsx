// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import TodoPage from './TodoPage';

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  tags: vi.fn(),
  create: vi.fn(),
  setStatus: vi.fn(),
  deleteTag: vi.fn(),
  archiveDelete: vi.fn(),
  export: vi.fn(),
  save: vi.fn(),
  settings: vi.fn(),
  toastAdd: vi.fn(),
  dialog: vi.fn(),
  listen: vi.fn(),
}));

vi.mock('@tauri-apps/api/event', () => ({ listen: mocks.listen }));
vi.mock('@tauri-apps/plugin-dialog', () => ({ save: mocks.save }));
vi.mock('@/settings/settings.api', () => ({
  SettingsQueryApiKey: { SETTINGS: 'settings' },
  getSettingsApi: mocks.settings,
}));
vi.mock('@/components/ui/toast', () => ({ toast: { add: mocks.toastAdd } }));
vi.mock('./todos.api', async (importOriginal) => {
  const original = await importOriginal<typeof import('./todos.api')>();
  return {
    ...original,
    queryTodosApi: mocks.query,
    getTodoTagsApi: mocks.tags,
    createTodoApi: mocks.create,
    setTodoStatusApi: mocks.setStatus,
    deleteTodoTagApi: mocks.deleteTag,
    archiveDeleteTodoTagApi: mocks.archiveDelete,
    exportTodosApi: mocks.export,
  };
});
vi.mock('./TodoDialog', () => ({
  default: (props: unknown) => {
    mocks.dialog(props);
    return null;
  },
}));

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <TodoPage />
    </QueryClientProvider>,
  );
}

describe('TodoPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.tags.mockResolvedValue([{ id: 4, name: '工作', count: 1 }]);
    mocks.query.mockResolvedValue({
      items: [
        {
          id: 1,
          title: '写测试',
          description: '',
          status: 'in_progress',
          is_high_priority: true,
          tags: ['工作'],
          created_at: '',
          updated_at: '',
          completed_at: null,
        },
      ],
      total: 1,
      completed: 0,
    });
    mocks.create.mockResolvedValue({ id: 2 });
    mocks.deleteTag.mockResolvedValue(undefined);
    mocks.archiveDelete.mockResolvedValue(undefined);
    mocks.export.mockResolvedValue('/tmp/2026-08-24-待办-工作.md');
    mocks.save.mockResolvedValue(null);
    mocks.settings.mockResolvedValue({ common: { paths: { todo_export_dir: null } } });
    mocks.listen.mockResolvedValue(() => {});
  });

  afterEach(cleanup);

  it('matches the bookmark workspace sidebar and content surface styles', async () => {
    renderPage();
    await screen.findByText('写测试');

    const sidebar = screen.getByText('分类').closest('aside');
    const tagControl = screen.getByText('工作', { selector: 'span.truncate' }).closest('.text-sm');
    const main = screen.getByText('写测试').closest('main');

    expect(sidebar?.classList.contains('w-56')).toBe(true);
    expect(sidebar?.classList.contains('bg-sidebar')).toBe(true);
    expect(tagControl).not.toBeNull();
    expect(main?.classList.contains('bg-background')).toBe(true);
  });

  it('combines a selected tag with a status filter', async () => {
    renderPage();
    expect(await screen.findByText('写测试')).toBeTruthy();
    const tag = screen.getByText('工作', { selector: 'span.truncate' });
    fireEvent.click(tag);
    expect(tag.closest('.text-sm')?.classList.contains('bg-primary/15')).toBe(true);
    fireEvent.click(screen.getByText('已完成'));
    await waitFor(() =>
      expect(mocks.query).toHaveBeenLastCalledWith({ status: 'completed', tag_id: 4 }),
    );
  });

  it('renders an empty circle for an in-progress task', async () => {
    renderPage();

    const toggle = await screen.findByRole('button', { name: '标记为已完成' });
    expect(toggle.querySelector('.lucide-circle')).toBeTruthy();
    expect(toggle.querySelector('.lucide-circle-dot')).toBeNull();
  });

  it('keeps the status panel at the bottom', async () => {
    renderPage();

    const statusPanel = await screen.findByText('1 个任务 · 0 个已完成');
    expect(statusPanel.tagName).toBe('FOOTER');
    expect(statusPanel.classList.contains('mt-auto')).toBe(true);
    expect(statusPanel.previousElementSibling?.getAttribute('data-slot')).toBe('separator');
  });

  it('quick creates on Enter with the documented defaults', async () => {
    renderPage();
    const input = await screen.findByPlaceholderText('快速添加任务，按 Enter 提交…');
    fireEvent.change(input, { target: { value: '新任务' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    await waitFor(() =>
      expect(mocks.create.mock.calls[0]?.[0]).toEqual({
        title: '新任务',
        description: '',
        tags: [],
        is_high_priority: false,
      }),
    );
  });

  it('uses the selected tag for dialog and quick creation', async () => {
    renderPage();
    await screen.findByText('写测试');
    fireEvent.click(screen.getByText('工作', { selector: 'span.truncate' }));

    fireEvent.click(screen.getByRole('button', { name: '新建任务' }));
    await waitFor(() =>
      expect(mocks.dialog.mock.calls[mocks.dialog.mock.calls.length - 1]?.[0]).toEqual(
        expect.objectContaining({ open: true, todo: null, defaultTag: '工作' }),
      ),
    );

    const input = screen.getByPlaceholderText('快速添加任务，按 Enter 提交…');
    fireEvent.change(input, { target: { value: '标签任务' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    await waitFor(() =>
      expect(mocks.create.mock.calls[0]?.[0]).toEqual({
        title: '标签任务',
        description: '',
        tags: ['工作'],
        is_high_priority: false,
      }),
    );
  });

  it('keeps quick input and uses the Base UI toast manager when creation fails', async () => {
    mocks.create.mockRejectedValueOnce({ message: '数据库写入失败' });
    renderPage();
    const input = await screen.findByPlaceholderText('快速添加任务，按 Enter 提交…');
    fireEvent.change(input, { target: { value: '不要丢失' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    await waitFor(() =>
      expect(mocks.toastAdd).toHaveBeenCalledWith({
        title: '数据库写入失败',
        type: 'error',
      }),
    );
    expect(input).toHaveProperty('value', '不要丢失');
  });

  it('cleans up a listener that resolves after unmount', async () => {
    let resolveListen: ((unlisten: () => void) => void) | undefined;
    const unlisten = vi.fn();
    mocks.listen.mockReturnValue(
      new Promise<() => void>((resolve) => {
        resolveListen = resolve;
      }),
    );

    const view = renderPage();
    view.unmount();
    resolveListen?.(unlisten);

    await waitFor(() => expect(unlisten).toHaveBeenCalledOnce());
  });

  it('shows a tag deletion error and clears it before reopening', async () => {
    mocks.deleteTag.mockRejectedValueOnce(new Error('标签仍被占用'));
    renderPage();
    const tag = await screen.findByText('工作', { selector: 'span.truncate' });

    fireEvent.contextMenu(tag);
    fireEvent.click(await screen.findByText('标签删除'));
    fireEvent.click(screen.getByRole('button', { name: '删除标签' }));

    expect(await screen.findByText('删除失败：标签仍被占用')).toBeTruthy();
    expect(screen.getByText('删除标签“工作”？')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: '取消' }));
    fireEvent.contextMenu(tag);
    fireEvent.click(await screen.findByText('标签删除'));

    expect(screen.queryByText('删除失败：标签仍被占用')).toBeNull();
    expect(screen.getByText('删除标签“工作”？')).toBeTruthy();
  });

  it('exports the selected tag through the save dialog', async () => {
    mocks.save.mockResolvedValue('/tmp/2026-08-24-待办-工作.md');
    renderPage();
    const tag = await screen.findByText('工作', { selector: 'span.truncate' });

    fireEvent.contextMenu(tag);
    fireEvent.click(await screen.findByText('导出'));

    await waitFor(() =>
      expect(mocks.save).toHaveBeenCalledWith({
        defaultPath: expect.stringMatching(/^\d{4}-\d{2}-\d{2}-待办-工作\.md$/),
        filters: [{ name: 'Markdown', extensions: ['md'] }],
      }),
    );
    await waitFor(() =>
      expect(mocks.export).toHaveBeenCalledWith('/tmp/2026-08-24-待办-工作.md', 4),
    );
    expect(mocks.toastAdd).toHaveBeenCalledWith({
      type: 'success',
      title: '导出成功',
      description: '/tmp/2026-08-24-待办-工作.md',
    });
  });

  it('uses the configured Todo export directory as the save default', async () => {
    mocks.settings.mockResolvedValue({ common: { paths: { todo_export_dir: '/tmp/todos' } } });
    renderPage();
    const tag = await screen.findByText('工作', { selector: 'span.truncate' });
    fireEvent.contextMenu(tag);
    fireEvent.click(await screen.findByText('导出'));

    await waitFor(() =>
      expect(mocks.save).toHaveBeenCalledWith({
        defaultPath: expect.stringMatching(/^\/tmp\/todos\/\d{4}-\d{2}-\d{2}-待办-工作\.md$/),
        filters: [{ name: 'Markdown', extensions: ['md'] }],
      }),
    );
  });

  it('does nothing when the save dialog is cancelled', async () => {
    mocks.save.mockResolvedValue(null);
    renderPage();
    const tag = await screen.findByText('工作', { selector: 'span.truncate' });

    fireEvent.contextMenu(tag);
    fireEvent.click(await screen.findByText('导出'));

    await waitFor(() => expect(mocks.save).toHaveBeenCalled());
    expect(mocks.export).not.toHaveBeenCalled();
  });

  it('shows an error toast when the export fails', async () => {
    mocks.save.mockResolvedValue('/tmp/2026-08-24-待办-工作.md');
    mocks.export.mockRejectedValueOnce({ message: '目录不可写' });
    renderPage();
    const tag = await screen.findByText('工作', { selector: 'span.truncate' });

    fireEvent.contextMenu(tag);
    fireEvent.click(await screen.findByText('导出'));

    await waitFor(() =>
      expect(mocks.toastAdd).toHaveBeenCalledWith({ title: '目录不可写', type: 'error' }),
    );
  });

  it('shows both tag actions in the context menu', async () => {
    renderPage();
    const tag = await screen.findByText('工作', { selector: 'span.truncate' });
    fireEvent.contextMenu(tag);
    expect(await screen.findByText('标签删除')).toBeTruthy();
    expect(screen.getByText('归档删除')).toBeTruthy();
  });

  it('blocks archive delete with a toast while a todo is in progress', async () => {
    renderPage();
    const tag = await screen.findByText('工作', { selector: 'span.truncate' });
    fireEvent.contextMenu(tag);
    fireEvent.click(await screen.findByText('归档删除'));

    await waitFor(() =>
      expect(mocks.toastAdd).toHaveBeenCalledWith({
        title: '当前标签存在未完成待办，无法归档删除。',
        type: 'error',
      }),
    );
    expect(mocks.archiveDelete).not.toHaveBeenCalled();
    expect(screen.queryByText('归档删除标签“工作”？')).toBeNull();
  });

  it('opens the archive confirm dialog and deletes when no todo is in progress', async () => {
    mocks.query.mockResolvedValue({
      items: [
        {
          id: 1,
          title: '已收尾',
          description: '',
          status: 'completed',
          is_high_priority: false,
          tags: ['工作'],
          created_at: '',
          updated_at: '',
          completed_at: '2026-07-29T00:00:00Z',
        },
      ],
      total: 1,
      completed: 1,
    });
    renderPage();
    const tag = await screen.findByText('工作', { selector: 'span.truncate' });
    fireEvent.contextMenu(tag);
    fireEvent.click(await screen.findByText('归档删除'));

    expect(screen.getByText('归档删除标签“工作”？')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '归档删除' }));

    await waitFor(() => expect(mocks.archiveDelete).toHaveBeenCalledWith(4));
  });

  it('shows the backend error inside the archive confirm dialog', async () => {
    mocks.query.mockResolvedValue({
      items: [
        {
          id: 1,
          title: '已收尾',
          description: '',
          status: 'completed',
          is_high_priority: false,
          tags: ['工作'],
          created_at: '',
          updated_at: '',
          completed_at: '2026-07-29T00:00:00Z',
        },
      ],
      total: 1,
      completed: 1,
    });
    mocks.archiveDelete.mockRejectedValueOnce({
      code: 'todo_tag_has_active_todos',
      message: '当前标签存在未完成待办，无法归档删除。',
      details: null,
    });
    renderPage();
    const tag = await screen.findByText('工作', { selector: 'span.truncate' });
    fireEvent.contextMenu(tag);
    fireEvent.click(await screen.findByText('归档删除'));
    fireEvent.click(screen.getByRole('button', { name: '归档删除' }));

    expect(
      await screen.findByText('归档删除失败：当前标签存在未完成待办，无法归档删除。'),
    ).toBeTruthy();
    expect(screen.getByText('归档删除标签“工作”？')).toBeTruthy();
    expect(mocks.toastAdd).not.toHaveBeenCalled();
  });
});
