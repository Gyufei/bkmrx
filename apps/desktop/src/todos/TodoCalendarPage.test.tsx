// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import TodoCalendarPage from './TodoCalendarPage';

const mocks = vi.hoisted(() => ({ getCalendarDays: vi.fn() }));

vi.mock('@/calendar/calendar.api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/calendar/calendar.api')>()),
  getCalendarDaysApi: mocks.getCalendarDays,
}));

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <TodoCalendarPage />
    </QueryClientProvider>,
  );
}

describe('TodoCalendarPage', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 8, 17, 12));
    mocks.getCalendarDays.mockResolvedValue([]);
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it('queries the complete visible six-week date range', () => {
    renderPage();

    expect(mocks.getCalendarDays).toHaveBeenCalledWith({
      start_date: '2026-08-31',
      end_date: '2026-10-11',
    });
  });

  it('navigates months from the sidebar header', () => {
    renderPage();
    const currentHeading = screen.getByRole('heading', { level: 2 }).textContent;

    fireEvent.click(screen.getByRole('button', { name: '下个月' }));

    expect(screen.getByRole('heading', { level: 2 }).textContent).not.toBe(currentHeading);
  });

  it('adds a named event to the selected day', () => {
    renderPage();

    fireEvent.click(screen.getByRole('button', { name: '添加事项' }));
    fireEvent.change(screen.getByRole('textbox', { name: '事项名称' }), {
      target: { value: '产品评审' },
    });
    fireEvent.click(screen.getByRole('button', { name: '添加' }));

    expect(screen.getByText('产品评审')).toBeVisible();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('renders month day cells as custom div interactions', () => {
    renderPage();

    const selectedDay = document.querySelector('[role="button"][aria-pressed="true"]');
    expect(selectedDay?.tagName).toBe('DIV');
  });
});
