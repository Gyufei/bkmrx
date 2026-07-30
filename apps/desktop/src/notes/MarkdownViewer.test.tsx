// @vitest-environment jsdom

import { readFileSync } from 'node:fs';

import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import MarkdownViewer from './MarkdownViewer';

const openMock = vi.hoisted(() => vi.fn());
const appCss = readFileSync('src/App.css', 'utf8');

vi.mock('@tauri-apps/plugin-shell', () => ({ open: openMock }));

afterEach(cleanup);

beforeEach(() => {
  openMock.mockReset();
  openMock.mockResolvedValue(undefined);
});

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
    expect(checkboxes[1]).not.toBeChecked();

    const tableScroll = screen.getByTestId('markdown-table-scroll');
    expect(within(tableScroll).getByRole('table')).toBeTruthy();
    expect(screen.getByText('const value = 1;').closest('code')?.className).toContain(
      'language-ts',
    );
  });

  it('reports the clicked task source line through an enabled checkbox', () => {
    const onToggleTask = vi.fn();
    render(
      <MarkdownViewer
        content={'- [ ] first\n\n  - [x] nested'}
        onToggleTask={onToggleTask}
      />,
    );

    const checkboxes = screen.getAllByRole('checkbox');
    expect(checkboxes[0]).toBeEnabled();
    expect(checkboxes[1]).toBeEnabled();
    fireEvent.click(checkboxes[1]);
    expect(onToggleTask).toHaveBeenCalledWith(3);
  });

  it('keeps task checkboxes disabled without a toggle callback', () => {
    render(<MarkdownViewer content="- [ ] task" />);
    expect(screen.getByRole('checkbox')).toBeDisabled();
  });

  it('does not turn raw html or dangerous urls into executable elements', () => {
    const { container } = render(
      <MarkdownViewer content={'<img src=x onerror=alert(1)>\n\n[bad](javascript:alert(1))'} />,
    );

    expect(container.querySelector('img')).toBeNull();
    const badLink = screen.getByText('bad').closest('a');
    expect(badLink?.getAttribute('href') ?? '').not.toMatch(/^javascript:/);

    const click = new MouseEvent('click', { bubbles: true, cancelable: true });
    badLink?.dispatchEvent(click);
    expect(click.defaultPrevented).toBe(true);
    expect(openMock).not.toHaveBeenCalled();
  });

  it('opens only absolute links allowed by the desktop shell', () => {
    render(
      <MarkdownViewer
        content={[
          '[HTTP](http://example.com)',
          '[HTTPS](https://example.com)',
          '[Mail](mailto:hello@example.com)',
          '[Phone](tel:+123456)',
        ].join(' ')}
      />,
    );

    for (const name of ['HTTP', 'HTTPS', 'Mail', 'Phone']) {
      fireEvent.click(screen.getByRole('link', { name }));
    }

    expect(openMock.mock.calls).toEqual([
      ['http://example.com'],
      ['https://example.com'],
      ['mailto:hello@example.com'],
      ['tel:+123456'],
    ]);
  });

  it('keeps relative, anchor, and unsupported protocol links inert', () => {
    render(
      <MarkdownViewer
        content={[
          '[Relative](./other.md)',
          '[Anchor](#section)',
          '[IRC](irc://chat.example.com)',
          '[XMPP](xmpp:hello@example.com)',
        ].join(' ')}
      />,
    );

    for (const name of ['Relative', 'Anchor', 'IRC', 'XMPP']) {
      const link = screen.getByText(name).closest('a');
      const click = new MouseEvent('click', { bubbles: true, cancelable: true });
      link?.dispatchEvent(click);
      expect(click.defaultPrevented).toBe(true);
    }
    expect(openMock).not.toHaveBeenCalled();
  });

  it('reports a desktop shell rejection without leaving an unhandled promise', async () => {
    const error = new Error('open denied');
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    openMock.mockRejectedValueOnce(error);
    render(<MarkdownViewer content="[External](https://example.com)" />);

    fireEvent.click(screen.getByRole('link', { name: 'External' }));

    await vi.waitFor(() =>
      expect(consoleError).toHaveBeenCalledWith('Failed to open external note link', {
        href: 'https://example.com',
        error,
      }),
    );
    expect(consoleError).toHaveBeenCalledTimes(1);
    consoleError.mockRestore();
  });

  it('does not forward react-markdown node metadata to native elements', () => {
    render(
      <MarkdownViewer
        content={'[External](https://example.com)\n\n| Name |\n| --- |\n| Value |'}
      />,
    );

    expect(screen.getByRole('link', { name: 'External' })).not.toHaveAttribute('node');
    expect(screen.getByRole('table')).not.toHaveAttribute('node');
  });

  it('maps dark Typography tokens to the application theme', () => {
    const darkViewerCss = appCss.match(/\.dark \.markdown-viewer \{([^}]*)}/)?.[1] ?? '';

    for (const [token, value] of [
      ['body', 'foreground'],
      ['headings', 'foreground'],
      ['links', 'primary'],
      ['bold', 'foreground'],
      ['counters', 'muted-foreground'],
      ['bullets', 'muted-foreground'],
      ['hr', 'border'],
      ['quotes', 'foreground'],
      ['quote-borders', 'border'],
      ['code', 'foreground'],
      ['pre-code', 'foreground'],
      ['pre-bg', 'muted'],
      ['th-borders', 'border'],
      ['td-borders', 'border'],
    ]) {
      expect(darkViewerCss).toContain(`--tw-prose-invert-${token}: var(--${value});`);
    }
  });

  it('wraps long links inside the rendered document width', () => {
    const linkCss = appCss.match(/\.markdown-viewer a \{([^}]*)}/)?.[1] ?? '';

    expect(linkCss).toContain('overflow-wrap: anywhere;');
    expect(linkCss).toContain('word-break: break-word;');
  });

  it('sizes and aligns rendered task checkboxes with the application accent color', () => {
    const taskCheckboxCss =
      appCss.match(
        /\.markdown-viewer \.task-list-item > input\[type='checkbox'\] \{([^}]*)}/,
      )?.[1] ?? '';
    const checkboxCss =
      appCss.match(
        /\.markdown-viewer \.task-list-item > input\[type='checkbox'\]:not\(:disabled\) \{([^}]*)}/,
      )?.[1] ?? '';

    expect(taskCheckboxCss).toContain('width: 1rem;');
    expect(taskCheckboxCss).toContain('height: 1rem;');
    expect(taskCheckboxCss).toContain('margin: 0 0.375rem 0 0;');
    expect(taskCheckboxCss).toContain('vertical-align: -0.125em;');
    expect(taskCheckboxCss).toContain('accent-color: var(--primary);');
    expect(checkboxCss).toContain('cursor: pointer;');
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
