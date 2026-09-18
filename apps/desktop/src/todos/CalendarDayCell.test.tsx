// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { CalendarEventType, CalendarHolidayDayType } from '@/calendar/calendar.types';
import { colorStyleForText } from '@/lib/text-color';
import CalendarDayCell from './CalendarDayCell';

describe('CalendarDayCell', () => {
  afterEach(cleanup);

  it('renders every normalized holiday display name after the day number', () => {
    render(
      <CalendarDayCell
        date={new Date(2026, 9, 1)}
        month={new Date(2026, 9, 1)}
        today={new Date(2026, 8, 17)}
        selectedDate={new Date(2026, 8, 17)}
        calendarDay={{
          date: '2026-10-01',
          holidays: [
            {
              name: '国庆节',
              display_name: '国庆节',
              day_type: CalendarHolidayDayType.DayOff,
              source: 'holiday-cn',
            },
            {
              name: '测试节',
              display_name: '测试节调休',
              day_type: CalendarHolidayDayType.AdjustedWorkday,
              source: 'holiday-cn',
            },
          ],
          events: [],
          todos: [],
        }}
        onSelect={vi.fn()}
        onCreate={vi.fn()}
        onEdit={vi.fn()}
      />,
    );

    expect(screen.getByText('国庆节 / 测试节调休')).toBeVisible();
    expect(screen.getByText('1')).toBeVisible();
  });

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
    expect(event.parentElement).toHaveClass('mt-1');
    expect(event).toHaveStyle(colorStyleForText('一个宽度不足时会被省略的完整事件名称'));
    expect(event).toHaveAttribute('data-slot', 'tooltip-trigger');
  });
});
