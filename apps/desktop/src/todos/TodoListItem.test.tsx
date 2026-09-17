// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Todo } from '@/types';
import { todoId, todoTagId } from '@/test-utils/identity';
import TodoListItem from './TodoListItem';

const todo: Todo = {
  id: todoId(1),
  title: '写测试',
  description: '',
  status: 'in_progress',
  is_high_priority: false,
  tags: ['工作'],
  start_date: null,
  due_date: null,
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
        tags={[{ id: todoTagId(4), name: '工作', count: 1 }]}
        statusPending={false}
        deletePending={false}
        onEdit={vi.fn()}
        onSelectTag={vi.fn()}
        onSetStatus={onSetStatus}
        onPrepareDelete={vi.fn()}
        onDelete={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '标记为已完成' }));
    expect(onSetStatus).toHaveBeenCalledWith(todo.id, 'completed');
  });

  it('exposes tags as keyboard-focusable filter buttons', () => {
    const onSelectTag = vi.fn();
    render(
      <TodoListItem
        todo={todo}
        tags={[{ id: todoTagId(4), name: '工作', count: 1 }]}
        statusPending={false}
        deletePending={false}
        onEdit={vi.fn()}
        onSelectTag={onSelectTag}
        onSetStatus={vi.fn()}
        onPrepareDelete={vi.fn()}
        onDelete={vi.fn()}
      />,
    );

    const tagButton = screen.getByRole('button', { name: '筛选标签 工作' });
    tagButton.focus();
    expect(document.activeElement).toBe(tagButton);

    fireEvent.click(tagButton);
    expect(onSelectTag).toHaveBeenCalledWith(todoTagId(4));
  });

  it('shows dates before tags with distinct start and due colors', () => {
    render(
      <TodoListItem
        todo={{ ...todo, start_date: '2026-09-17', due_date: '2026-09-20' }}
        tags={[{ id: todoTagId(4), name: '工作', count: 1 }]}
        statusPending={false}
        deletePending={false}
        onEdit={vi.fn()}
        onSelectTag={vi.fn()}
        onSetStatus={vi.fn()}
        onPrepareDelete={vi.fn()}
        onDelete={vi.fn()}
      />,
    );

    const start = screen.getByLabelText('开始日期 2026/9/17');
    const due = screen.getByLabelText('截止日期 2026/9/20');
    const tag = screen.getByRole('button', { name: '筛选标签 工作' });
    expect(start.className).toContain('text-emerald');
    expect(due.className).toContain('text-destructive');
    expect(start.compareDocumentPosition(tag) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByText('→')).toBeTruthy();
  });

  it('keeps suspended status changes in the context menu', async () => {
    const onSetStatus = vi.fn();
    render(
      <TodoListItem
        todo={{ ...todo, status: 'suspended' }}
        tags={[]}
        statusPending={false}
        deletePending={false}
        onEdit={vi.fn()}
        onSelectTag={vi.fn()}
        onSetStatus={onSetStatus}
        onPrepareDelete={vi.fn()}
        onDelete={vi.fn()}
      />,
    );

    expect(screen.queryByRole('button', { name: /标记为/ })).toBeNull();
    fireEvent.contextMenu(screen.getByText('写测试'));
    fireEvent.click(await screen.findByText('取消挂起'));

    await waitFor(() => expect(onSetStatus).toHaveBeenCalledWith(todo.id, 'in_progress'));
  });

  it('requires confirmation before deleting a todo', async () => {
    const onDelete = vi.fn().mockResolvedValue(undefined);
    const onPrepareDelete = vi.fn();
    render(
      <TodoListItem
        todo={todo}
        tags={[]}
        statusPending={false}
        deletePending={false}
        onEdit={vi.fn()}
        onSelectTag={vi.fn()}
        onSetStatus={vi.fn()}
        onPrepareDelete={onPrepareDelete}
        onDelete={onDelete}
      />,
    );

    fireEvent.contextMenu(screen.getByText('写测试'));
    fireEvent.click(await screen.findByText('删除'));

    expect(onPrepareDelete).toHaveBeenCalledOnce();
    expect(onDelete).not.toHaveBeenCalled();
    expect(await screen.findByText('删除任务“写测试”？')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: '取消' }));
    expect(onDelete).not.toHaveBeenCalled();

    fireEvent.contextMenu(screen.getByText('写测试'));
    fireEvent.click(await screen.findByText('删除'));
    expect(onPrepareDelete).toHaveBeenCalledTimes(2);
    fireEvent.click(screen.getByRole('button', { name: '删除' }));
    await waitFor(() => expect(onDelete).toHaveBeenCalledOnce());
    expect(onDelete).toHaveBeenCalledWith(todo.id);
  });
});
