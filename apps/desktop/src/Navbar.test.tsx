// @vitest-environment jsdom

import { act, cleanup, render, screen } from '@testing-library/react';
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
});
