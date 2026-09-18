// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { CalendarEventType } from '@/calendar/calendar.types';
import { colorStyleForText } from '@/lib/text-color';
import CalendarDayCell from './calendar-day-cell';

describe('CalendarDayCell', () => {
  afterEach(cleanup);

  it('matches the shared calendar styles for today and selected dates', () => {
    const { rerender } = render(
      <CalendarDayCell
        date={new Date(2026, 8, 17)}
        month={new Date(2026, 8, 1)}
        today={new Date(2026, 8, 17)}
        selectedDate={new Date(2026, 8, 16)}
        onSelect={vi.fn()}
        onCreate={vi.fn()}
        onEdit={vi.fn()}
      />,
    );
    expect(screen.getByText('17')).toHaveClass('text-primary');
    expect(screen.getByText('17')).not.toHaveClass('bg-primary/10');

    rerender(
      <CalendarDayCell
        date={new Date(2026, 8, 17)}
        month={new Date(2026, 8, 1)}
        today={new Date(2026, 8, 17)}
        selectedDate={new Date(2026, 8, 17)}
        onSelect={vi.fn()}
        onCreate={vi.fn()}
        onEdit={vi.fn()}
      />,
    );
    expect(screen.getByText('17')).toHaveClass(
      'bg-primary',
      'text-primary-foreground',
      'ring-[3px]',
    );
  });

  it('spaces events below the date and wires the full title to a tooltip', () => {
    render(
      <CalendarDayCell
        date={new Date(2026, 8, 17)}
        month={new Date(2026, 8, 1)}
        today={new Date(2026, 8, 18)}
        selectedDate={new Date(2026, 8, 16)}
        calendarDay={{
          date: '2026-09-17',
          lunar_date: null,
          solar_term: null,
          holidays: [],
          events: [
            {
              id: 'event-1',
              title: '一个宽度不足时会被省略的完整事件名称',
              event_type: CalendarEventType.Work,
              source: 'local',
            },
          ],
          todos: [],
        }}
        onSelect={vi.fn()}
        onCreate={vi.fn()}
        onEdit={vi.fn()}
      />,
    );

    const event = screen.getByText('一个宽度不足时会被省略的完整事件名称');
    expect(event.parentElement).toHaveClass('mt-1.5');
    expect(event).toHaveStyle(colorStyleForText('一个宽度不足时会被省略的完整事件名称'));
    expect(event).toHaveAttribute('data-slot', 'tooltip-trigger');
  });
});
