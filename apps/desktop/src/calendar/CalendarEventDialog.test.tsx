// @vitest-environment jsdom

import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { describe, expect, it, vi } from 'vitest';

import CalendarEventDialog from './CalendarEventDialog';
import { CalendarEventType } from './calendar.types';

function renderDialog(overrides: Partial<React.ComponentProps<typeof CalendarEventDialog>> = {}) {
  const props: React.ComponentProps<typeof CalendarEventDialog> = {
    open: true,
    onOpenChange: vi.fn(),
    title: '',
    onTitleChange: vi.fn(),
    eventType: CalendarEventType.Other,
    onEventTypeChange: vi.fn(),
    editingEvent: null,
    saving: false,
    onSave: vi.fn(),
    onRemove: vi.fn(),
    ...overrides,
  };
  return { props, ...render(<CalendarEventDialog {...props} />) };
}

describe('CalendarEventDialog', () => {
  it('renders create mode with add button', () => {
    renderDialog();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('添加事件');
    expect(screen.getByRole('button', { name: '添加' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '删除' })).toBeNull();
  });

  it('renders edit mode with save and delete buttons', () => {
    renderDialog({
      editingEvent: {
        id: 'e1',
        title: 'Test',
        event_type: CalendarEventType.Work,
        source: 'local',
      },
    });
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('修改事件');
    expect(screen.getByRole('button', { name: '保存' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '删除' })).toBeInTheDocument();
  });

  it('calls onTitleChange when typing', () => {
    const onTitleChange = vi.fn();
    renderDialog({ onTitleChange });

    fireEvent.change(screen.getByRole('textbox', { name: '事项名称' }), {
      target: { value: 'New Title' },
    });
    expect(onTitleChange).toHaveBeenCalledWith('New Title');
  });

  it('calls onEventTypeChange when selecting a type', () => {
    const onEventTypeChange = vi.fn();
    renderDialog({ onEventTypeChange });

    fireEvent.click(screen.getByRole('combobox', { name: '事件类型' }));
    fireEvent.click(screen.getByRole('option', { name: '工作' }));
    expect(onEventTypeChange).toHaveBeenCalledWith(CalendarEventType.Work);
  });

  it('disables submit when title is empty', () => {
    renderDialog({ title: '' });
    expect(screen.getByRole('button', { name: '添加' })).toBeDisabled();
  });

  it('enables submit when title is non-empty', () => {
    renderDialog({ title: 'Something' });
    expect(screen.getByRole('button', { name: '添加' })).not.toBeDisabled();
  });

  it('disables submit while saving', () => {
    renderDialog({ title: 'Something', saving: true });
    expect(screen.getByRole('button', { name: '添加' })).toBeDisabled();
  });

  it('calls onSave on form submit', () => {
    const onSave = vi.fn();
    renderDialog({ title: 'Test', onSave });

    fireEvent.submit(screen.getByRole('textbox', { name: '事项名称' }).closest('form')!);
    expect(onSave).toHaveBeenCalled();
  });

  it('calls onRemove when delete is clicked', () => {
    const onRemove = vi.fn();
    renderDialog({
      editingEvent: {
        id: 'e1',
        title: 'Test',
        event_type: CalendarEventType.Work,
        source: 'local',
      },
      onRemove,
    });

    fireEvent.click(screen.getByRole('button', { name: '删除' }));
    expect(onRemove).toHaveBeenCalled();
  });

  it('calls onOpenChange when cancel is clicked', () => {
    const onOpenChange = vi.fn();
    renderDialog({ onOpenChange });

    fireEvent.click(screen.getByRole('button', { name: '取消' }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('shows current event type label in combobox trigger', () => {
    renderDialog({ eventType: CalendarEventType.Anniversary });
    expect(screen.getByRole('combobox', { name: '事件类型' })).toHaveTextContent('纪念日');
  });
});
