// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { CalendarHolidayDayType } from '@/calendar/calendar.types';
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
        events={[]}
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
      />,
    );

    expect(screen.getByText('国庆节 / 测试节调休')).toBeVisible();
    expect(screen.getByText('1')).toBeVisible();
  });
});
