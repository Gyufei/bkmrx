// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import NavBar, { PATHS } from './Navbar';

const getServerStatus = vi.hoisted(() => vi.fn());

vi.mock('./lib/invoke', () => ({
  invokeGetServerStatus: getServerStatus,
}));

describe('NavBar server status', () => {
  beforeEach(() => {
    getServerStatus.mockResolvedValue({ running: true, url: 'http://127.0.0.1:8733' });
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('shows connection status without exposing the server URL', async () => {
    render(<NavBar currentPath={PATHS.BOOKMARKS} onCurrentPathChange={vi.fn()} />);

    await act(async () => undefined);
    expect(getServerStatus).toHaveBeenCalledOnce();
    expect(screen.getByText('连接正常')).toBeTruthy();
    expect(screen.queryByText('http://127.0.0.1:8733')).toBeNull();
  });

  it('shows bookmark secondary tabs only in the bookmark workspace', () => {
    const onSubpageChange = vi.fn();
    const view = render(
      <NavBar
        currentPath={PATHS.BOOKMARKS}
        onCurrentPathChange={vi.fn()}
        onBookmarkSubpageChange={onSubpageChange}
      />,
    );
    const bookmarkTabs = screen.getAllByRole('tab', { name: '书签' });
    fireEvent.click(bookmarkTabs[bookmarkTabs.length - 1]);
    expect(onSubpageChange.mock.calls[0][0]).toBe('bookmarks');
    expect(screen.getByRole('tab', { name: '导航' })).toBeTruthy();

    view.rerender(
      <NavBar
        currentPath={PATHS.NOTES}
        onCurrentPathChange={vi.fn()}
        onBookmarkSubpageChange={onSubpageChange}
      />,
    );
    expect(screen.queryByRole('tab', { name: '导航' })).toBeNull();
  });
});
