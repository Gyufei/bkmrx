// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import TodoDialog from './TodoDialog';

afterEach(cleanup);

describe('TodoDialog', () => {
  it('includes a pending tag when saving without pressing Enter', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(
      <TodoDialog open todo={null} availableTags={[]} onOpenChange={vi.fn()} onSave={onSave} />,
    );

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
});
