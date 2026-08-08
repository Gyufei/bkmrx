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
  toastAdd: vi.fn(),
  dialog: vi.fn(),
  listen: vi.fn(),
}));

vi.mock('@tauri-apps/api/event', () => ({ listen: mocks.listen }));
vi.mock('@/components/ui/toast', () => ({ toast: { add: mocks.toastAdd } }));
vi.mock('./todos.api', async (importOriginal) => {
  const original = await importOriginal<typeof import('./todos.api')>();
  return {
    ...original,
    queryTodosApi: mocks.query,
    getTodoTagsApi: mocks.tags,
    createTodoApi: mocks.create,
    setTodoStatusApi: mocks.setStatus,
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
    mocks.listen.mockResolvedValue(() => {});
  });

  afterEach(cleanup);

  it('combines a selected tag with a status filter', async () => {
    renderPage();
    expect(await screen.findByText('写测试')).toBeTruthy();
    fireEvent.click(screen.getByText('工作', { selector: 'span.truncate' }));
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

  it('keeps the status panel at the bottom and uses the shared scrollbar style', async () => {
    const { container } = renderPage();

    const statusPanel = await screen.findByText('1 个任务 · 0 个已完成');
    expect(statusPanel.tagName).toBe('FOOTER');
    expect(statusPanel.classList.contains('mt-auto')).toBe(true);
    expect(statusPanel.classList.contains('border-t')).toBe(true);
    expect(container.querySelectorAll('.thin-scrollbar')).toHaveLength(2);
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
});
