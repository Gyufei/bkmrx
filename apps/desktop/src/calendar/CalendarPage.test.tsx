// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import CalendarPage from './CalendarPage';

const mocks = vi.hoisted(() => ({
  getCalendarDays: vi.fn(),
  createEvent: vi.fn(),
  updateEvent: vi.fn(),
  deleteEvent: vi.fn(),
}));

vi.mock('@/lib/invoke', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/invoke')>()),
  invokeGetCalendarDays: mocks.getCalendarDays,
  invokeCreateCalendarEvent: mocks.createEvent,
  invokeUpdateCalendarEvent: mocks.updateEvent,
  invokeDeleteCalendarEvent: mocks.deleteEvent,
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
    mocks.getCalendarDays.mockResolvedValue([
      {
        date: '2026-09-17',
        lunar_date: null,
        solar_term: null,
        holidays: [],
        events: [],
        todos: [],
      },
    ]);
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

  it('updates today after the app regains focus across a local date boundary', async () => {
    renderPage();
    await vi.waitFor(() =>
      expect(screen.getByRole('button', { name: '2026年9月17日' })).toBeVisible(),
    );

    const day17 = screen.getByRole('button', { name: '2026年9月17日' });
    const day18 = screen.getByRole('button', { name: '2026年9月18日' });
    expect(day17).toHaveAttribute('aria-current', 'date');
    expect(day18).not.toHaveAttribute('aria-current');

    vi.setSystemTime(new Date(2026, 8, 18, 12));
    act(() => window.dispatchEvent(new Event('focus')));

    expect(day17).not.toHaveAttribute('aria-current');
    expect(day18).toHaveAttribute('aria-current', 'date');
    expect(day17).toHaveAttribute('aria-pressed', 'true');
    expect(
      document.querySelector('[data-slot="calendar"] [data-day="2026-09-18"]'),
    ).toHaveAttribute('data-today', 'true');
  });

  it('shows destructive and empty states for unavailable calendar data', async () => {
    mocks.getCalendarDays.mockRejectedValueOnce(new Error('database unavailable'));
    const failed = renderPage();
    await vi.waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('日历加载失败'));
    expect(screen.getByRole('alert')).toHaveClass('text-destructive');

    failed.unmount();
    mocks.getCalendarDays.mockResolvedValueOnce([]);
    renderPage();
    await vi.waitFor(() => expect(screen.getByText('暂无日历数据')).toBeVisible());
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

  it('renders month day cells as custom div interactions', async () => {
    renderPage();

    const selectedDay = await vi.waitFor(() => {
      const element = document.querySelector('[role="button"][aria-pressed="true"]');
      expect(element).toBeTruthy();
      return element;
    });
    expect(selectedDay?.tagName).toBe('DIV');
  });
});
