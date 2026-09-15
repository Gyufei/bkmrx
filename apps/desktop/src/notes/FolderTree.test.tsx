// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';

import type { WorkspaceDirectory } from '../types';
import FolderTree from './FolderTree';

const child: WorkspaceDirectory = {
  name: '资料',
  relative_path: '资料',
  files: [],
  directories: [
    {
      name: '二级',
      relative_path: '资料/二级',
      files: [],
      directories: [],
    },
  ],
};

const root: WorkspaceDirectory = {
  name: 'notes',
  relative_path: '',
  files: [],
  directories: [child],
};

afterEach(cleanup);

it('exposes expansion state and preserves it across ordinary tree refreshes', () => {
  const { rerender } = render(
    <FolderTree root={root} selectedPath="" onSelect={vi.fn()} onDelete={vi.fn()} />,
  );
  const folder = screen.getByRole('button', { name: '资料' });
  expect(folder.getAttribute('aria-expanded')).toBe('true');

  fireEvent.click(folder);
  expect(folder.getAttribute('aria-expanded')).toBe('false');
  rerender(
    <FolderTree root={{ ...root }} selectedPath="资料" onSelect={vi.fn()} onDelete={vi.fn()} />,
  );

  expect(screen.getByRole('button', { name: '资料' }).getAttribute('aria-expanded')).toBe('false');
});

it('forgets expansion state after a directory disappears', () => {
  const { rerender } = render(
    <FolderTree root={root} selectedPath="" onSelect={vi.fn()} onDelete={vi.fn()} />,
  );
  expect(screen.getByRole('button', { name: '资料' }).getAttribute('aria-expanded')).toBe('true');

  rerender(
    <FolderTree
      root={{ ...root, directories: [] }}
      selectedPath=""
      onSelect={vi.fn()}
      onDelete={vi.fn()}
    />,
  );
  rerender(<FolderTree root={{ ...root }} selectedPath="" onSelect={vi.fn()} onDelete={vi.fn()} />);

  expect(screen.getByRole('button', { name: '资料' }).getAttribute('aria-expanded')).toBe('false');
});
