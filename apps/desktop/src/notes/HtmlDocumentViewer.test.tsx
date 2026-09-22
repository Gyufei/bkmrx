// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import HtmlDocumentViewer from './HtmlDocumentViewer';

const openHtmlDocumentApi = vi.hoisted(() => vi.fn());
const openExternalNoteFileApi = vi.hoisted(() => vi.fn());

vi.mock('./notes.api', () => ({ openHtmlDocumentApi, openExternalNoteFileApi }));

beforeEach(() => {
  openHtmlDocumentApi.mockReset().mockResolvedValue({
    content: '<!doctype html><html><body><h1>Visual</h1></body></html>',
  });
  openExternalNoteFileApi.mockReset().mockResolvedValue(undefined);
});

afterEach(cleanup);

it('loads a trusted HTML document into the notes content pane', async () => {
  render(<HtmlDocumentViewer revision={7} filePath="reports/visual.HTML" />);

  expect(screen.getByRole('status').textContent).toContain('加载文档');
  await screen.findByTitle('查看：visual.HTML');

  expect(openHtmlDocumentApi).toHaveBeenCalledWith(7, 'reports/visual.HTML');
  expect(screen.getByText('visual.HTML')).toBeTruthy();
});

it('reloads the document from disk when refresh is requested', async () => {
  render(<HtmlDocumentViewer revision={1} filePath="visual.html" />);
  await screen.findByTitle('查看：visual.html');

  openHtmlDocumentApi.mockResolvedValueOnce({ content: '<p>new</p>' });
  fireEvent.click(screen.getByRole('button', { name: '刷新 HTML 文档' }));

  await waitFor(() => expect(openHtmlDocumentApi).toHaveBeenCalledTimes(2));
  expect(await screen.findByTitle('查看：visual.html')).toBeTruthy();
});

it('offers retry and system-open after a read failure', async () => {
  openHtmlDocumentApi.mockRejectedValueOnce(new Error('bad encoding'));
  render(<HtmlDocumentViewer revision={3} filePath="visual.html" />);

  expect(await screen.findByText('HTML 文档加载失败')).toBeTruthy();
  fireEvent.click(screen.getAllByRole('button', { name: '系统打开' })[1]);
  expect(openExternalNoteFileApi).toHaveBeenCalledWith(3, 'visual.html');

  fireEvent.click(screen.getByRole('button', { name: '重试' }));
  expect(await screen.findByTitle('查看：visual.html')).toBeTruthy();
});
