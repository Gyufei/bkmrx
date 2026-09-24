// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { CalendarEventType } from './calendar.types';
import { useCalendarDayWorkspace } from './use-calendar-day-workspace';

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

function TestHarness() {
  const workspace = useCalendarDayWorkspace();
  const displayDate = (date: Date | undefined) =>
    date &&
    `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  return (
    <div>
      <span data-testid="month">{workspace.navigation.month.toISOString()}</span>
      <span data-testid="selected">{workspace.navigation.selectedDate.toISOString()}</span>
      <span data-testid="range">
        {displayDate(workspace.days.visibleDates[0])}|
        {displayDate(workspace.days.visibleDates[workspace.days.visibleDates.length - 1])}
      </span>
      <span data-testid="status">{workspace.days.status}</span>
      <span data-testid="dialog">{String(workspace.eventEditor.open)}</span>
      <span data-testid="title">{workspace.eventEditor.title}</span>
      <span data-testid="type">{workspace.eventEditor.eventType}</span>
      <span data-testid="editing">{workspace.eventEditor.editingEvent?.id ?? 'null'}</span>
      <button onClick={() => workspace.openCreate()}>create</button>
      <button
        onClick={() =>
          workspace.openEdit(
            {
              id: 'e1',
              title: 'Test',
              event_type: CalendarEventType.Work,
              source: 'local',
            },
            new Date(2026, 8, 20),
          )
        }
      >
        edit
      </button>
      <button onClick={() => void workspace.eventEditor.save()}>save</button>
      <button onClick={() => void workspace.eventEditor.remove()}>remove</button>
      <button onClick={() => workspace.navigation.changeMonth(-1)}>prev</button>
      <button onClick={() => workspace.navigation.changeMonth(1)}>next</button>
      <input
        aria-label="title"
        value={workspace.eventEditor.title}
        onChange={(event) => workspace.eventEditor.setTitle(event.target.value)}
      />
    </div>
  );
}

function renderWorkspace() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <TestHarness />
    </QueryClientProvider>,
  );
}

describe('useCalendarDayWorkspace', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 8, 17, 12));
    mocks.getCalendarDays.mockResolvedValue([]);
    mocks.createEvent.mockResolvedValue({});
    mocks.updateEvent.mockResolvedValue({});
    mocks.deleteEvent.mockResolvedValue({});
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('owns the visible six-week range and its loading outcome', async () => {
    renderWorkspace();

    expect(mocks.getCalendarDays).toHaveBeenCalledWith({
      start_date: '2026-08-31',
      end_date: '2026-10-11',
    });
    expect(screen.getByTestId('range')).toHaveTextContent('2026-08-31|2026-10-11');
    await vi.waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('empty'));
  });

  it('keeps month navigation and the selected Calendar Day consistent', () => {
    renderWorkspace();
    const initialMonth = screen.getByTestId('month').textContent;

    fireEvent.click(screen.getByRole('button', { name: 'next' }));
    expect(screen.getByTestId('month').textContent).not.toBe(initialMonth);
    expect(screen.getByTestId('selected')).toHaveTextContent('2026-10-17');

    fireEvent.click(screen.getByRole('button', { name: 'prev' }));
    expect(screen.getByTestId('month').textContent).toBe(initialMonth);
  });

  it('owns create and edit drafts', () => {
    renderWorkspace();

    fireEvent.click(screen.getByRole('button', { name: 'create' }));
    expect(screen.getByTestId('dialog')).toHaveTextContent('true');
    expect(screen.getByTestId('editing')).toHaveTextContent('null');
    expect(screen.getByTestId('type')).toHaveTextContent('other');

    fireEvent.click(screen.getByRole('button', { name: 'edit' }));
    expect(screen.getByTestId('editing')).toHaveTextContent('e1');
    expect(screen.getByTestId('title')).toHaveTextContent('Test');
    expect(screen.getByTestId('type')).toHaveTextContent('work');
  });

  it('writes a trimmed event and refreshes Calendar Days before closing the draft', async () => {
    renderWorkspace();
    await vi.waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('empty'));

    fireEvent.click(screen.getByRole('button', { name: 'create' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'title' }), {
      target: { value: '  New Event  ' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'save' }));

    await vi.waitFor(() =>
      expect(mocks.createEvent).toHaveBeenCalledWith(
        { title: 'New Event', date: '2026-09-17', event_type: 'other' },
        expect.any(Object),
      ),
    );
    await vi.waitFor(() => expect(mocks.getCalendarDays).toHaveBeenCalledTimes(2));
    expect(screen.getByTestId('dialog')).toHaveTextContent('false');
  });

  it('updates and deletes through the same mutation consistency policy', async () => {
    renderWorkspace();
    fireEvent.click(screen.getByRole('button', { name: 'edit' }));
    fireEvent.click(screen.getByRole('button', { name: 'save' }));

    await vi.waitFor(() =>
      expect(mocks.updateEvent).toHaveBeenCalledWith('e1', {
        title: 'Test',
        date: '2026-09-20',
        event_type: CalendarEventType.Work,
      }),
    );

    fireEvent.click(screen.getByRole('button', { name: 'edit' }));
    fireEvent.click(screen.getByRole('button', { name: 'remove' }));
    await vi.waitFor(() =>
      expect(mocks.deleteEvent).toHaveBeenCalledWith('e1', expect.any(Object)),
    );
  });
});
