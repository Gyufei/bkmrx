// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it } from 'vitest';

import { CalendarHolidayDayType, type CalendarDay } from './calendar.types';
import CalendarDayHeader from './calendar-day-header';

const date = new Date(2026, 4, 17);

function day(overrides: Partial<CalendarDay> = {}): CalendarDay {
  return {
    date: '2026-05-17',
    lunar_date: {
      year: 2026,
      month: 4,
      day: 1,
      is_leap_month: false,
      month_name: '四月',
      day_name: '初一',
    },
    solar_term: null,
    holidays: [],
    events: [],
    todos: [],
    ...overrides,
  };
}

function renderHeader(calendarDay?: CalendarDay) {
  return render(
    <CalendarDayHeader
      date={date}
      today={new Date(2026, 4, 18)}
      selectedDate={new Date(2026, 4, 16)}
      calendarDay={calendarDay}
    />,
  );
}

describe('CalendarDayHeader', () => {
  afterEach(cleanup);

  it('always renders the solar day and uses the lunar month name on the first day', () => {
    renderHeader(day());

    expect(screen.getByText('17')).toBeVisible();
    expect(screen.getByText('四月')).toHaveClass('text-muted-foreground');
    expect(screen.queryByText('初一')).toBeNull();
  });

  it('uses only the lunar day name after the first day', () => {
    renderHeader(
      day({
        lunar_date: {
          year: 2026,
          month: 4,
          day: 11,
          is_leap_month: false,
          month_name: '四月',
          day_name: '十一',
        },
      }),
    );

    expect(screen.getByText('十一')).toBeVisible();
    expect(screen.queryByText('四月')).toBeNull();
  });

  it('shows the solar term instead of the lunar date', () => {
    renderHeader(day({ solar_term: '小满' }));

    expect(screen.getByText('小满')).toBeVisible();
    expect(screen.queryByText('四月')).toBeNull();
  });

  it('colors adjusted workdays red and other holidays with chart-5', () => {
    renderHeader(
      day({
        holidays: [
          {
            name: '劳动节',
            display_name: '劳动节',
            day_type: CalendarHolidayDayType.DayOff,
            source: 'holiday-cn',
          },
          {
            name: '劳动节',
            display_name: '劳动节调休',
            day_type: CalendarHolidayDayType.AdjustedWorkday,
            source: 'holiday-cn',
          },
        ],
      }),
    );

    expect(screen.getByText('劳动节')).toHaveClass('text-chart-5');
    expect(screen.getByText('劳动节调休')).toHaveClass('text-destructive');
  });
});
