// @vitest-environment jsdom

import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { describe, expect, it, vi } from 'vitest';

import CalendarEventDialog from './CalendarEventDialog';
import { CalendarEventType } from './calendar.types';
import type { CalendarEventEditor } from './use-calendar-day-workspace';

function renderDialog(overrides: Partial<CalendarEventEditor> = {}) {
  const editor: CalendarEventEditor = {
    open: true,
    setOpen: vi.fn(),
    title: '',
    setTitle: vi.fn(),
    eventType: CalendarEventType.Other,
    setEventType: vi.fn(),
    editingEvent: null,
    saving: false,
    save: vi.fn(),
    remove: vi.fn(),
    ...overrides,
  };
  return { editor, ...render(<CalendarEventDialog editor={editor} />) };
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
    const setTitle = vi.fn();
    renderDialog({ setTitle });

    fireEvent.change(screen.getByRole('textbox', { name: '事项名称' }), {
      target: { value: 'New Title' },
    });
    expect(setTitle).toHaveBeenCalledWith('New Title');
  });

  it('calls onEventTypeChange when selecting a type', () => {
    const setEventType = vi.fn();
    renderDialog({ setEventType });

    fireEvent.click(screen.getByRole('combobox', { name: '事件类型' }));
    fireEvent.click(screen.getByRole('option', { name: '工作' }));
    expect(setEventType).toHaveBeenCalledWith(CalendarEventType.Work);
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
    const save = vi.fn();
    renderDialog({ title: 'Test', save });

    fireEvent.submit(screen.getByRole('textbox', { name: '事项名称' }).closest('form')!);
    expect(save).toHaveBeenCalled();
  });

  it('calls onRemove when delete is clicked', () => {
    const remove = vi.fn();
    renderDialog({
      editingEvent: {
        id: 'e1',
        title: 'Test',
        event_type: CalendarEventType.Work,
        source: 'local',
      },
      remove,
    });

    fireEvent.click(screen.getByRole('button', { name: '删除' }));
    expect(remove).toHaveBeenCalled();
  });

  it('calls onOpenChange when cancel is clicked', () => {
    const setOpen = vi.fn();
    renderDialog({ setOpen });

    fireEvent.click(screen.getByRole('button', { name: '取消' }));
    expect(setOpen).toHaveBeenCalledWith(false);
  });

  it('shows current event type label in combobox trigger', () => {
    renderDialog({ eventType: CalendarEventType.Anniversary });
    expect(screen.getByRole('combobox', { name: '事件类型' })).toHaveTextContent('纪念日');
  });
});
