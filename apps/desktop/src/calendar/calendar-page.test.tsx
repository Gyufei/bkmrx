// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import CalendarPage from './calendar-page';

const mocks = vi.hoisted(() => ({
  getCalendarDays: vi.fn(),
  createEvent: vi.fn(),
  updateEvent: vi.fn(),
  deleteEvent: vi.fn(),
}));

vi.mock('@/calendar/calendar.api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/calendar/calendar.api')>()),
  getCalendarDaysApi: mocks.getCalendarDays,
  createCalendarEventApi: mocks.createEvent,
  updateCalendarEventApi: mocks.updateEvent,
  deleteCalendarEventApi: mocks.deleteEvent,
}));

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <CalendarPage />
    </QueryClientProvider>,
  );
}

describe('CalendarPage', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 8, 17, 12));
    mocks.getCalendarDays.mockResolvedValue([]);
    mocks.createEvent.mockResolvedValue({
      id: 'event-1',
      title: '产品评审',
      date: '2026-09-17',
      event_type: 'other',
    });
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

  it('creates an event through the dialog', async () => {
    renderPage();

    fireEvent.click(screen.getByRole('button', { name: '添加事项' }));
    fireEvent.change(screen.getByRole('textbox', { name: '事项名称' }), {
      target: { value: '产品评审' },
    });
    fireEvent.click(screen.getByRole('combobox', { name: '事件类型' }));
    fireEvent.click(screen.getByRole('option', { name: '工作' }));
    fireEvent.click(screen.getByRole('button', { name: '添加' }));

    await vi.waitFor(() =>
      expect(mocks.createEvent.mock.calls[0]?.[0]).toEqual({
        title: '产品评审',
        date: '2026-09-17',
        event_type: 'work',
      }),
    );
    await vi.waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('edits an existing event through the dialog', async () => {
    mocks.getCalendarDays.mockResolvedValue([
      {
        date: '2026-09-17',
        lunar_date: null,
        solar_term: null,
        holidays: [],
        events: [{ id: 'event-1', title: '纪念日', event_type: 'anniversary', source: 'local' }],
        todos: [],
      },
    ]);
    mocks.updateEvent.mockResolvedValue({});
    renderPage();

    await vi.waitFor(() => expect(screen.getByText('纪念日')).toBeVisible());
    fireEvent.click(screen.getByText('纪念日'));
    expect(screen.getByRole('combobox', { name: '事件类型' })).toHaveTextContent('纪念日');
    fireEvent.click(screen.getByRole('combobox', { name: '事件类型' }));
    fireEvent.click(screen.getByRole('option', { name: '个人' }));
    fireEvent.click(screen.getByRole('button', { name: '保存' }));

    await vi.waitFor(() =>
      expect(mocks.updateEvent.mock.calls[0]?.[1]).toEqual({
        title: '纪念日',
        date: '2026-09-17',
        event_type: 'personal',
      }),
    );
  });

  it('renders month day cells as custom div interactions', () => {
    renderPage();

    const selectedDay = document.querySelector('[role="button"][aria-pressed="true"]');
    expect(selectedDay?.tagName).toBe('DIV');
  });
});
