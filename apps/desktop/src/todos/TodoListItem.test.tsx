// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Todo } from '@/types';
import TodoListItem from './TodoListItem';

const todo: Todo = {
  id: 1,
  title: '写测试',
  description: '',
  status: 'in_progress',
  is_high_priority: false,
  tags: ['工作'],
  created_at: '',
  updated_at: '',
  completed_at: null,
};

afterEach(cleanup);

describe('TodoListItem', () => {
  it('toggles an in-progress todo to completed', () => {
    const onSetStatus = vi.fn();
    render(
      <TodoListItem
        todo={todo}
        tags={[{ id: 4, name: '工作', count: 1 }]}
        statusPending={false}
        onEdit={vi.fn()}
        onSelectTag={vi.fn()}
        onSetStatus={onSetStatus}
        onDelete={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '标记为已完成' }));
    expect(onSetStatus).toHaveBeenCalledWith(1, 'completed');
  });

  it('keeps suspended status changes in the context menu', async () => {
    const onSetStatus = vi.fn();
    render(
      <TodoListItem
        todo={{ ...todo, status: 'suspended' }}
        tags={[]}
        statusPending={false}
        onEdit={vi.fn()}
        onSelectTag={vi.fn()}
        onSetStatus={onSetStatus}
        onDelete={vi.fn()}
      />,
    );

    expect(screen.queryByRole('button', { name: /标记为/ })).toBeNull();
    fireEvent.contextMenu(screen.getByText('写测试'));
    fireEvent.click(await screen.findByText('取消挂起'));

    await waitFor(() => expect(onSetStatus).toHaveBeenCalledWith(1, 'in_progress'));
  });

  it('keeps todo deletion as a direct context-menu action', async () => {
    const onDelete = vi.fn();
    render(
      <TodoListItem
        todo={todo}
        tags={[]}
        statusPending={false}
        onEdit={vi.fn()}
        onSelectTag={vi.fn()}
        onSetStatus={vi.fn()}
        onDelete={onDelete}
      />,
    );

    fireEvent.contextMenu(screen.getByText('写测试'));
    fireEvent.click(await screen.findByText('删除'));

    await waitFor(() => expect(onDelete).toHaveBeenCalledWith(1));
  });
});
