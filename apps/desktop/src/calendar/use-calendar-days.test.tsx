// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useCalendarDays } from './use-calendar-days';

const mocks = vi.hoisted(() => ({ getCalendarDays: vi.fn() }));

vi.mock('./calendar.api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./calendar.api')>()),
  getCalendarDaysApi: mocks.getCalendarDays,
}));

afterEach(() => vi.clearAllMocks());

describe('useCalendarDays', () => {
  it('loads the requested inclusive date range', async () => {
    mocks.getCalendarDays.mockResolvedValue([]);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    renderHook(() => useCalendarDays({ start_date: '2026-08-31', end_date: '2026-10-11' }), {
      wrapper: ({ children }) => (
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
      ),
    });

    await waitFor(() =>
      expect(mocks.getCalendarDays).toHaveBeenCalledWith({
        start_date: '2026-08-31',
        end_date: '2026-10-11',
      }),
    );
  });
});
