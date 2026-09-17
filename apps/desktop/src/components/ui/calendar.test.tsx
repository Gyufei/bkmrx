// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { useState } from 'react';
import { afterEach, describe, expect, it } from 'vitest';

import { Calendar } from './calendar';

function CalendarHarness() {
  const [selected, setSelected] = useState(new Date(2026, 8, 16));
  return (
    <>
      <button onClick={() => setSelected(new Date(2026, 8, 17))}>选择 17 日</button>
      <Calendar mode="single" month={new Date(2026, 8, 1)} selected={selected} />
    </>
  );
}

describe('Calendar focus styling', () => {
  afterEach(cleanup);

  it('does not keep a ring on DayPicker internal focused dates', () => {
    render(<CalendarHarness />);
    const previousDate = screen.getByRole('button', { name: /September 16th, 2026/ });

    fireEvent.click(previousDate);
    fireEvent.click(screen.getByRole('button', { name: '选择 17 日' }));
    const selectedDate = screen.getByRole('button', { name: /September 17th, 2026/ });

    expect(previousDate.className).not.toContain('group-data-[focused=true]/day:ring');
    expect(selectedDate.className).toContain('data-[selected-single=true]:ring-[3px]');
  });
});
