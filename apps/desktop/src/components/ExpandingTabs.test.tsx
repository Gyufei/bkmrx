// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { CalendarDays, SquareCheckBig } from 'lucide-react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ExpandingTabs } from './ExpandingTabs';

const ITEMS = [
  { value: 'todos', label: '待办', icon: SquareCheckBig },
  { value: 'calendar', label: '日历', icon: CalendarDays },
] as const;

describe('ExpandingTabs', () => {
  afterEach(cleanup);

  it('exposes the active tab and changes tabs on click', () => {
    const onValueChange = vi.fn();
    render(
      <ExpandingTabs
        items={ITEMS}
        value="todos"
        onValueChange={onValueChange}
        ariaLabel="Todo 二级页面"
      />,
    );

    expect(screen.getByRole('tab', { name: '待办' })).toHaveAttribute('aria-selected', 'true');
    fireEvent.click(screen.getByRole('tab', { name: '日历' }));
    expect(onValueChange).toHaveBeenCalledWith('calendar');
  });

  it('supports arrow-key tab navigation', () => {
    const onValueChange = vi.fn();
    render(
      <ExpandingTabs
        items={ITEMS}
        value="todos"
        onValueChange={onValueChange}
        ariaLabel="Todo 二级页面"
      />,
    );

    fireEvent.keyDown(screen.getByRole('tab', { name: '待办' }), { key: 'ArrowRight' });
    expect(onValueChange).toHaveBeenCalledWith('calendar');
    expect(screen.getByRole('tab', { name: '日历' })).toHaveFocus();
  });

  it('keeps every label visible so the secondary navigation does not shift on hover', () => {
    render(
      <ExpandingTabs
        items={ITEMS}
        value="calendar"
        onValueChange={vi.fn()}
        ariaLabel="Todo 二级页面"
      />,
    );

    expect(screen.getByRole('tab', { name: '待办' })).toHaveTextContent('待办');
    expect(screen.getByRole('tab', { name: '日历' })).toHaveTextContent('日历');
  });
});
