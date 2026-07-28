// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it, vi } from 'vitest';

import MarkdownViewer from './MarkdownViewer';

afterEach(cleanup);

describe('MarkdownViewer', () => {
  it('renders basic markdown, fenced code, a table, and task items', () => {
    render(
      <MarkdownViewer
        content={[
          '# Heading',
          '',
          '- [x] shipped',
          '- [ ] pending',
          '',
          '| Name | Value |',
          '| --- | --- |',
          '| A | 1 |',
          '',
          '```ts',
          'const value = 1;',
          '```',
        ].join('\n')}
      />,
    );

    expect(screen.getByRole('heading', { name: 'Heading' })).toBeTruthy();
    const checkboxes = screen.getAllByRole('checkbox');
    expect(checkboxes).toHaveLength(2);
    expect(checkboxes[0]).toBeChecked();
    expect(checkboxes[0]).toBeDisabled();
    expect(checkboxes[1]).not.toBeChecked();
    expect(checkboxes[1]).toBeDisabled();

    const tableScroll = screen.getByTestId('markdown-table-scroll');
    expect(within(tableScroll).getByRole('table')).toBeTruthy();
    expect(screen.getByText('const value = 1;').closest('code')?.className).toContain(
      'language-ts',
    );
  });

  it('does not turn raw html or dangerous urls into executable elements', () => {
    const { container } = render(
      <MarkdownViewer content={'<img src=x onerror=alert(1)>\n\n[bad](javascript:alert(1))'} />,
    );

    expect(container.querySelector('img')).toBeNull();
    expect(screen.getByText('bad').closest('a')?.getAttribute('href') ?? '').not.toMatch(
      /^javascript:/,
    );
  });

  it('renders a discoverable empty-note state', () => {
    render(<MarkdownViewer content="" />);

    expect(screen.getByText(/空白笔记/)).toBeTruthy();
    expect(screen.getByText(/⌘E|Ctrl E/)).toBeTruthy();
  });

  it('reports and restores the rendered-view scroll position', () => {
    const onScrollTopChange = vi.fn();
    render(
      <MarkdownViewer
        content="# Long note"
        initialScrollTop={120}
        onScrollTopChange={onScrollTopChange}
      />,
    );
    const scroller = screen.getByTestId('markdown-view-scroll');

    expect(scroller.scrollTop).toBe(120);
    Object.defineProperty(scroller, 'scrollTop', { configurable: true, value: 240 });
    fireEvent.scroll(scroller);
    expect(onScrollTopChange).toHaveBeenCalledWith(240);
  });
});
