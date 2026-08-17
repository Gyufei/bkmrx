// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import TagInput from './TagInput';

afterEach(cleanup);

function TestInput({ initialValue = [] }: { initialValue?: string[] }) {
  const [value, setValue] = useState(initialValue);
  return (
    <TagInput
      inputId="test-tags"
      value={value}
      onChange={setValue}
      suggestions={['待办', '稍后', '工作']}
    />
  );
}

describe('TagInput', () => {
  it('exposes an accessible multiselect combobox and options', () => {
    render(<TestInput />);

    const input = screen.getByRole('combobox');
    fireEvent.focus(input);

    const listbox = screen.getByRole('listbox', { name: '标签建议' });
    expect(input).toHaveAttribute('aria-autocomplete', 'list');
    expect(input).toHaveAttribute('aria-expanded', 'true');
    expect(input).toHaveAttribute('aria-controls', listbox.id);
    expect(listbox).toHaveAttribute('aria-multiselectable', 'true');
    expect(screen.getByRole('option', { name: '待办' })).toHaveAttribute('aria-selected', 'false');
  });

  it.each([
    ['Enter', '临时'],
    [',', '临时'],
    ['，', '临时'],
  ])('adds free-form tags with %s', (key, tag) => {
    render(<TestInput />);
    const input = screen.getByRole('combobox');

    fireEvent.change(input, { target: { value: tag } });
    fireEvent.keyDown(input, { key });

    expect(screen.getByText(tag)).toBeInTheDocument();
    expect(input).toHaveValue('');
  });

  it('navigates suggestions with arrow keys and adds the active option', () => {
    render(<TestInput />);
    const input = screen.getByRole('combobox');

    fireEvent.focus(input);
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    expect(input.getAttribute('aria-activedescendant')).toContain('-option-0');
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'ArrowUp' });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(screen.getByLabelText('移除标签 待办')).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: '待办' })).not.toBeInTheDocument();
  });

  it('supports clicking multiple suggestions and removing tags with Backspace', () => {
    render(<TestInput />);
    const input = screen.getByRole('combobox');

    fireEvent.focus(input);
    fireEvent.click(screen.getByRole('option', { name: '待办' }));
    fireEvent.click(screen.getByRole('option', { name: '稍后' }));
    expect(screen.getByLabelText('移除标签 待办')).toBeInTheDocument();
    expect(screen.getByLabelText('移除标签 稍后')).toBeInTheDocument();

    fireEvent.keyDown(input, { key: 'Backspace' });
    expect(screen.queryByLabelText('移除标签 稍后')).not.toBeInTheDocument();
    expect(screen.getByLabelText('移除标签 待办')).toBeInTheDocument();
  });

  it('lets keyboard users focus and activate a selected tag removal button', () => {
    render(<TestInput initialValue={['工作']} />);

    const removeButton = screen.getByRole('button', { name: '移除标签 工作' });
    removeButton.focus();
    expect(removeButton).toHaveFocus();

    fireEvent.click(removeButton);
    expect(screen.queryByRole('button', { name: '移除标签 工作' })).not.toBeInTheDocument();
  });

  it('closes suggestions with Escape and reports pending input changes', () => {
    const onPendingChange = vi.fn();
    render(
      <TagInput
        value={[]}
        onChange={vi.fn()}
        suggestions={['待办']}
        onPendingChange={onPendingChange}
      />,
    );
    const input = screen.getByRole('combobox');

    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: '待' } });
    fireEvent.keyDown(input, { key: 'Escape' });

    expect(onPendingChange).toHaveBeenCalledWith('待');
    expect(input).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });
});
