// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import EmbeddedDocumentFrame from './EmbeddedDocumentFrame';

const openExternal = vi.hoisted(() => vi.fn());

vi.mock('@tauri-apps/plugin-shell', () => ({ open: openExternal }));

afterEach(cleanup);
beforeEach(() => openExternal.mockReset().mockResolvedValue(undefined));

it('loads an approved remote document with the fixed runtime sandbox', () => {
  render(
    <EmbeddedDocumentFrame
      source={{ kind: 'remote', url: 'https://example.com/article' }}
      title="Remote document"
    />,
  );

  const frame = screen.getByTitle('Remote document');
  expect(frame.getAttribute('src')).toBe('https://example.com/article');
  expect(frame.getAttribute('srcdoc')).toBeNull();
  expect(frame.getAttribute('sandbox')).toBe('allow-scripts allow-forms allow-same-origin');
});

it('fails closed before creating a frame for a non-HTTP remote source', async () => {
  const onRuntimeError = vi.fn();
  render(
    <EmbeddedDocumentFrame
      source={{ kind: 'remote', url: 'file:///tmp/private.html' }}
      title="Rejected document"
      onRuntimeError={onRuntimeError}
    />,
  );

  expect(screen.queryByTitle('Rejected document')).toBeNull();
  await waitFor(() => expect(onRuntimeError).toHaveBeenCalledWith({ kind: 'invalid-source' }));
});

it('owns trusted HTML loading and its navigation matrix', async () => {
  const onLoad = vi.fn();
  render(
    <EmbeddedDocumentFrame
      source={{ kind: 'trusted-html', html: '<!doctype html><h1>Visual</h1>' }}
      title="Trusted document"
      onLoad={onLoad}
    />,
  );

  const frame = screen.getByTitle('Trusted document') as HTMLIFrameElement;
  expect(frame.getAttribute('srcdoc')).toContain('<h1>Visual</h1>');
  const document = frame.contentDocument!;
  document.body.innerHTML = `
    <a href="#section">Fragment</a>
    <a href="https://example.com/report">External</a>
    <a href="relative.html">Relative</a>
    <a href="javascript:void(0)">Script URL</a>
    <a href="#%zz">Malformed fragment</a>
  `;
  fireEvent.load(frame);
  expect(onLoad).toHaveBeenCalledOnce();

  const [fragment, external, relative, script, malformedFragment] = Array.from(
    document.querySelectorAll('a'),
  );
  const click = (anchor: HTMLAnchorElement) => {
    const event = new MouseEvent('click', { bubbles: true, cancelable: true });
    anchor.dispatchEvent(event);
    return event;
  };

  expect(click(fragment).defaultPrevented).toBe(true);
  expect(click(external).defaultPrevented).toBe(true);
  expect(openExternal).toHaveBeenCalledWith('https://example.com/report');
  expect(click(relative).defaultPrevented).toBe(true);
  expect(click(script).defaultPrevented).toBe(true);
  const onWindowError = vi.fn((event: ErrorEvent) => event.preventDefault());
  window.addEventListener('error', onWindowError);
  expect(click(malformedFragment).defaultPrevented).toBe(true);
  expect(onWindowError).not.toHaveBeenCalled();
  window.removeEventListener('error', onWindowError);
  expect(openExternal).toHaveBeenCalledTimes(1);
});

it('reports external navigation failures through the runtime interface', async () => {
  openExternal.mockRejectedValueOnce(new Error('unavailable'));
  const onRuntimeError = vi.fn();
  render(
    <EmbeddedDocumentFrame
      source={{ kind: 'trusted-html', html: '<a href="mailto:test@example.com">Mail</a>' }}
      title="Trusted document"
      onRuntimeError={onRuntimeError}
    />,
  );
  const frame = screen.getByTitle('Trusted document') as HTMLIFrameElement;
  const document = frame.contentDocument!;
  document.body.innerHTML = '<a href="mailto:test@example.com">Mail</a>';
  fireEvent.load(frame);

  fireEvent.click(document.querySelector('a')!);

  await waitFor(() =>
    expect(onRuntimeError).toHaveBeenCalledWith({
      kind: 'external-navigation-failed',
      url: 'mailto:test@example.com',
    }),
  );
});

it('reports when a trusted document cannot be observed', async () => {
  const onRuntimeError = vi.fn();
  render(
    <EmbeddedDocumentFrame
      source={{ kind: 'trusted-html', html: '<p>Trusted</p>' }}
      title="Inaccessible document"
      onRuntimeError={onRuntimeError}
    />,
  );
  const frame = screen.getByTitle('Inaccessible document') as HTMLIFrameElement;
  Object.defineProperty(frame, 'contentDocument', { configurable: true, value: null });

  fireEvent.load(frame);

  expect(onRuntimeError).toHaveBeenCalledWith({ kind: 'document-access-denied' });
});
