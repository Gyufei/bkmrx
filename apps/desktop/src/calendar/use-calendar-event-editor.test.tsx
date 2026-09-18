// @vitest-environment jsdom

import { cleanup, render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { CalendarEventType } from './calendar.types';
import { useCalendarEventEditor } from './use-calendar-event-editor';

const mocks = vi.hoisted(() => ({
  createEvent: vi.fn(),
  updateEvent: vi.fn(),
  deleteEvent: vi.fn(),
}));

vi.mock('@/calendar/calendar.api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/calendar/calendar.api')>()),
  createCalendarEventApi: mocks.createEvent,
  updateCalendarEventApi: mocks.updateEvent,
  deleteCalendarEventApi: mocks.deleteEvent,
}));

function TestHarness() {
  const editor = useCalendarEventEditor();
  return (
    <div>
      <span data-testid="month">{editor.month.toISOString()}</span>
      <span data-testid="selected">{editor.selectedDate.toISOString()}</span>
      <span data-testid="dialog">{String(editor.dialogOpen)}</span>
      <span data-testid="title">{editor.eventTitle}</span>
      <span data-testid="type">{editor.eventType}</span>
      <span data-testid="editing">{editor.editingEvent?.id ?? 'null'}</span>
      <span data-testid="saving">{String(editor.saving)}</span>
      <button data-testid="create" onClick={() => editor.openCreate()}>
        create
      </button>
      <button
        data-testid="edit"
        onClick={() =>
          editor.openEdit(
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
      <button data-testid="save" onClick={() => void editor.save()}>
        save
      </button>
      <button data-testid="remove" onClick={() => void editor.remove()}>
        remove
      </button>
      <button data-testid="prev" onClick={() => editor.changeMonth(-1)}>
        prev
      </button>
      <button data-testid="next" onClick={() => editor.changeMonth(1)}>
        next
      </button>
      <input
        data-testid="title-input"
        value={editor.eventTitle}
        onChange={(e) => editor.setEventTitle(e.target.value)}
      />
    </div>
  );
}

function renderHarness() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <TestHarness />
    </QueryClientProvider>,
  );
}

describe('useCalendarEventEditor', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 8, 17, 12));
    mocks.createEvent.mockResolvedValue({});
    mocks.updateEvent.mockResolvedValue({});
    mocks.deleteEvent.mockResolvedValue({});
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it('initializes with today selected and dialog closed', () => {
    renderHarness();
    expect(screen.getByTestId('dialog')).toHaveTextContent('false');
    expect(screen.getByTestId('editing')).toHaveTextContent('null');
    expect(screen.getByTestId('title')).toHaveTextContent('');
  });

  it('opens create dialog with empty form', () => {
    renderHarness();
    fireEvent.click(screen.getByTestId('create'));

    expect(screen.getByTestId('dialog')).toHaveTextContent('true');
    expect(screen.getByTestId('editing')).toHaveTextContent('null');
    expect(screen.getByTestId('title')).toHaveTextContent('');
    expect(screen.getByTestId('type')).toHaveTextContent('other');
  });

  it('opens edit dialog prefilled from event', () => {
    renderHarness();
    fireEvent.click(screen.getByTestId('edit'));

    expect(screen.getByTestId('dialog')).toHaveTextContent('true');
    expect(screen.getByTestId('editing')).toHaveTextContent('e1');
    expect(screen.getByTestId('title')).toHaveTextContent('Test');
    expect(screen.getByTestId('type')).toHaveTextContent('work');
  });

  it('calls create API on save when creating', async () => {
    renderHarness();
    fireEvent.click(screen.getByTestId('create'));
    fireEvent.change(screen.getByTestId('title-input'), { target: { value: 'New Event' } });
    fireEvent.click(screen.getByTestId('save'));

    await vi.waitFor(() =>
      expect(mocks.createEvent).toHaveBeenCalledWith(
        { title: 'New Event', date: '2026-09-17', event_type: 'other' },
        expect.any(Object),
      ),
    );
  });

  it('calls update API on save when editing', async () => {
    renderHarness();
    fireEvent.click(screen.getByTestId('edit'));
    fireEvent.click(screen.getByTestId('save'));

    await vi.waitFor(() =>
      expect(mocks.updateEvent).toHaveBeenCalledWith('e1', {
        title: 'Test',
        date: '2026-09-20',
        event_type: CalendarEventType.Work,
      }),
    );
  });

  it('calls delete API on remove', async () => {
    renderHarness();
    fireEvent.click(screen.getByTestId('edit'));
    fireEvent.click(screen.getByTestId('remove'));

    await vi.waitFor(() =>
      expect(mocks.deleteEvent).toHaveBeenCalledWith('e1', expect.any(Object)),
    );
  });

  it('navigates months forward and backward', () => {
    renderHarness();
    const initialMonth = screen.getByTestId('month').textContent;

    fireEvent.click(screen.getByTestId('next'));
    const afterNext = screen.getByTestId('month').textContent;
    expect(afterNext).not.toBe(initialMonth);

    fireEvent.click(screen.getByTestId('prev'));
    expect(screen.getByTestId('month').textContent).toBe(initialMonth);
  });
});
