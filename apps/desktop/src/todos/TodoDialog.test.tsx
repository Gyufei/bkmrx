// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
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
      }),
    );
  });
});
