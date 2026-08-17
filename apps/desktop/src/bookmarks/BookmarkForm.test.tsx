// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import BookmarkForm, { type BookmarkFormValues } from './BookmarkForm';

vi.mock('@/components/TagInput', () => ({
  default: ({ inputId, disabled }: { inputId?: string; disabled?: boolean }) => (
    <input id={inputId} aria-label="标签（可选）" disabled={disabled} />
  ),
}));

const initialValues: BookmarkFormValues = {
  url: ' https://example.com ',
  title: ' Example ',
  tags: ['reference'],
  description: ' Description ',
};

afterEach(cleanup);

describe('BookmarkForm', () => {
  it('trims text fields before submitting', () => {
    const onSubmit = vi.fn();
    render(
      <BookmarkForm
        idPrefix="test-bookmark"
        initialValues={initialValues}
        submitLabel="保存"
        pendingLabel="保存中..."
        tagSuggestions={[]}
        isPending={false}
        onCancel={vi.fn()}
        onSubmit={onSubmit}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '保存' }));

    expect(onSubmit).toHaveBeenCalledWith({
      url: 'https://example.com',
      title: 'Example',
      tags: ['reference'],
      description: 'Description',
    });
  });

  it('disables submission when the URL only contains whitespace', () => {
    render(
      <BookmarkForm
        idPrefix="test-bookmark"
        initialValues={{ ...initialValues, url: '   ' }}
        submitLabel="保存"
        pendingLabel="保存中..."
        tagSuggestions={[]}
        isPending={false}
        onCancel={vi.fn()}
        onSubmit={vi.fn()}
      />,
    );

    expect(screen.getByRole('button', { name: '保存' })).toBeDisabled();
    expect(screen.getByLabelText('URL')).toHaveAttribute('aria-invalid', 'true');
  });

  it('locks every control and shows the pending label while submitting', () => {
    render(
      <BookmarkForm
        idPrefix="test-bookmark"
        initialValues={initialValues}
        submitLabel="保存"
        pendingLabel="保存中..."
        tagSuggestions={[]}
        isPending
        onCancel={vi.fn()}
        onSubmit={vi.fn()}
      />,
    );

    expect(screen.getByLabelText('URL')).toBeDisabled();
    expect(screen.getByLabelText('标题（可选）')).toBeDisabled();
    expect(screen.getByLabelText('标签（可选）')).toBeDisabled();
    expect(screen.getByLabelText('描述（可选）')).toBeDisabled();
    expect(screen.getByRole('button', { name: '取消' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '保存中...' })).toBeDisabled();
  });

  it('renders mutation errors without owning data-layer behavior', () => {
    render(
      <BookmarkForm
        idPrefix="test-bookmark"
        initialValues={initialValues}
        submitLabel="保存"
        pendingLabel="保存中..."
        tagSuggestions={[]}
        errorMessage="更新失败：duplicate URL"
        isPending={false}
        onCancel={vi.fn()}
        onSubmit={vi.fn()}
      />,
    );

    expect(screen.getByText('更新失败：duplicate URL')).toBeInTheDocument();
  });
});
