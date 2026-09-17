// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { todoId } from '@/test-utils/identity';
import TodoDialog from './TodoDialog';

beforeAll(() => {
  window.PointerEvent = MouseEvent as typeof PointerEvent;
});

function renderDialog(props: React.ComponentProps<typeof TodoDialog>) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <TodoDialog {...props} />
    </QueryClientProvider>,
  );
}

afterEach(cleanup);

describe('TodoDialog', () => {
  it('prefills the selected tag for a new task', () => {
    renderDialog({
      open: true,
      todo: null,
      availableTags: [],
      defaultTag: '工作',
      onOpenChange: vi.fn(),
      onSave: vi.fn(),
    });

    expect(screen.getByText('工作')).toBeTruthy();
  });

  it('includes a pending tag when saving without pressing Enter', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    renderDialog({
      open: true,
      todo: null,
      availableTags: [],
      onOpenChange: vi.fn(),
      onSave,
    });

    fireEvent.change(screen.getByLabelText('标题'), { target: { value: '任务' } });
    fireEvent.change(screen.getByLabelText('标签'), { target: { value: '工作' } });
    fireEvent.click(screen.getByRole('button', { name: '保存' }));

    await waitFor(() =>
      expect(onSave).toHaveBeenCalledWith({
        title: '任务',
        description: '',
        tags: ['工作'],
        is_high_priority: false,
        start_date: null,
        due_date: null,
      }),
    );
  });

  it('uses the shared checkbox and submits the high-priority state', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    renderDialog({
      open: true,
      todo: null,
      availableTags: [],
      onOpenChange: vi.fn(),
      onSave,
    });

    fireEvent.change(screen.getByLabelText('标题'), { target: { value: '紧急任务' } });
    fireEvent.click(screen.getByRole('checkbox', { name: '高优先级' }));
    fireEvent.click(screen.getByRole('button', { name: '保存' }));

    await waitFor(() =>
      expect(onSave).toHaveBeenCalledWith({
        title: '紧急任务',
        description: '',
        tags: [],
        is_high_priority: true,
        start_date: null,
        due_date: null,
      }),
    );
  });

  it('prefills and explicitly clears optional dates', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    renderDialog({
      open: true,
      todo: {
        id: todoId(1),
        title: '有日期的任务',
        description: '',
        status: 'in_progress',
        is_high_priority: false,
        tags: [],
        start_date: '2026-09-17',
        due_date: '2026-09-20',
        created_at: '',
        updated_at: '',
        completed_at: null,
      },
      availableTags: [],
      onOpenChange: vi.fn(),
      onSave,
    });

    expect(screen.getByRole('button', { name: '开始日期' }).textContent).toContain('2026');
    expect(screen.getByRole('button', { name: '截止日期' }).textContent).toContain('2026');
    fireEvent.click(screen.getByRole('button', { name: '清空开始日期' }));
    fireEvent.click(screen.getByRole('button', { name: '清空截止日期' }));
    fireEvent.click(screen.getByRole('button', { name: '保存' }));

    await waitFor(() =>
      expect(onSave).toHaveBeenCalledWith(
        expect.objectContaining({ start_date: null, due_date: null }),
      ),
    );
  });

  it('blocks saving when the start date is later than the due date', () => {
    renderDialog({
      open: true,
      todo: {
        id: todoId(1),
        title: '错误日期',
        description: '',
        status: 'in_progress',
        is_high_priority: false,
        tags: [],
        start_date: '2026-09-21',
        due_date: '2026-09-20',
        created_at: '',
        updated_at: '',
        completed_at: null,
      },
      availableTags: [],
      onOpenChange: vi.fn(),
      onSave: vi.fn(),
    });

    expect(screen.getByRole('alert').textContent).toBe('开始日期不能晚于截止日期');
    expect(screen.getByRole('button', { name: '保存' })).toHaveProperty('disabled', true);
  });
});
