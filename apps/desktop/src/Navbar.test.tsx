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
    vi.useFakeTimers();
    getServerStatus.mockResolvedValue({ running: true, url: 'http://127.0.0.1:8733' });
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('reveals the server URL for three seconds when clicked', async () => {
    render(<NavBar currentPath={PATHS.BOOKMARKS} onCurrentPathChange={vi.fn()} />);

    await act(async () => undefined);
    expect(getServerStatus).toHaveBeenCalledOnce();
    expect(screen.getByText('Server Running')).toBeTruthy();
    expect(screen.queryByText('http://127.0.0.1:8733')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: '显示服务器地址' }));
    expect(screen.getByText('http://127.0.0.1:8733')).toBeTruthy();

    act(() => vi.advanceTimersByTime(2_999));
    expect(screen.getByText('http://127.0.0.1:8733')).toBeTruthy();

    act(() => vi.advanceTimersByTime(1));
    expect(screen.getByText('Server Running')).toBeTruthy();
  });
});
