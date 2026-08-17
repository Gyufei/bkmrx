// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';

import CollapsibleSidebar from './CollapsibleSidebar';

afterEach(cleanup);

it('collapses to a clickable 48px sidebar and expands again', () => {
  render(
    <CollapsibleSidebar title="分类" className="w-56">
      <div>侧边栏内容</div>
    </CollapsibleSidebar>,
  );

  fireEvent.click(screen.getByRole('button', { name: '折叠侧边栏' }));

  const expandButton = screen.getByRole('button', { name: '展开侧边栏' });
  const sidebar = expandButton.closest('aside');
  expect(sidebar?.classList.contains('w-12')).toBe(true);
  expect(sidebar?.getAttribute('data-collapsed')).toBe('true');
  expect(screen.getByText('侧边栏内容')).toBeTruthy();
  expect(expandButton.querySelector('.lucide-text-align-justify')).toBeTruthy();

  fireEvent.click(expandButton);

  expect(screen.getByText('侧边栏内容')).toBeTruthy();
  expect(screen.getByRole('button', { name: '折叠侧边栏' })).toBeTruthy();
});
