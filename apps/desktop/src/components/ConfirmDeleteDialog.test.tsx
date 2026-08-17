// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ConfirmDeleteDialog from './ConfirmDeleteDialog';

afterEach(cleanup);

describe('ConfirmDeleteDialog', () => {
  it('locks cancellation and repeated submission while pending', () => {
    const onOpenChange = vi.fn();
    const onConfirm = vi.fn();
    render(
      <ConfirmDeleteDialog
        open
        title="删除项目？"
        description="此操作不可撤销。"
        pending
        onOpenChange={onOpenChange}
        onConfirm={onConfirm}
      />,
    );

    const cancel = screen.getByRole('button', { name: '取消' });
    const confirm = screen.getByRole('button', { name: '删除' });
    expect(cancel.getAttribute('disabled')).not.toBeNull();
    expect(confirm.getAttribute('disabled')).not.toBeNull();

    fireEvent.click(cancel);
    fireEvent.click(confirm);
    expect(onOpenChange).not.toHaveBeenCalled();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('keeps an error visible for retry', () => {
    render(
      <ConfirmDeleteDialog
        open
        title="删除项目？"
        description="此操作不可撤销。"
        error={new Error('无法删除')}
        onOpenChange={vi.fn()}
        onConfirm={vi.fn()}
      />,
    );

    expect(screen.getByText('删除失败：无法删除')).toBeTruthy();
    expect(screen.getByRole('button', { name: '删除' }).getAttribute('disabled')).toBeNull();
  });
});
