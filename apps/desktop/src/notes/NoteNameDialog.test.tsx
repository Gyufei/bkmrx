// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';

import NoteNameDialog from './NoteNameDialog';

afterEach(cleanup);

it('submits only once when Enter is pressed repeatedly during submission', () => {
  const onSubmit = vi.fn(() => new Promise<void>(() => undefined));
  render(
    <NoteNameDialog
      open
      note={null}
      pending={false}
      error={null}
      onOpenChange={vi.fn()}
      onSubmit={onSubmit}
    />,
  );
  const input = screen.getByLabelText('文件名');
  fireEvent.change(input, { target: { value: '新笔记' } });

  fireEvent.keyDown(input, { key: 'Enter' });
  fireEvent.keyDown(input, { key: 'Enter', repeat: true });

  expect(onSubmit).toHaveBeenCalledOnce();
  expect(onSubmit).toHaveBeenCalledWith('新笔记');
});

it('does not submit an IME composition confirmation as Enter', () => {
  const onSubmit = vi.fn();
  render(
    <NoteNameDialog
      open
      note={null}
      pending={false}
      error={null}
      onOpenChange={vi.fn()}
      onSubmit={onSubmit}
    />,
  );
  const input = screen.getByLabelText('文件名');
  fireEvent.change(input, { target: { value: '中文笔记' } });

  fireEvent.keyDown(input, { key: 'Enter', isComposing: true });

  expect(onSubmit).not.toHaveBeenCalled();
});
