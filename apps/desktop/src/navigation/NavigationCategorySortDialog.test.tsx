// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { navigationCategoryId } from '@/test-utils/identity';
import type { NavigationCategory } from '@/types';
import NavigationCategorySortDialog from './NavigationCategorySortDialog';

const categories: NavigationCategory[] = ['工具', '博客', '文档'].map((name, index) => ({
  id: navigationCategoryId(index + 1),
  name,
  order: index,
  created_at: 1,
  updated_at: 1,
}));

describe('NavigationCategorySortDialog', () => {
  afterEach(cleanup);

  it('submits the complete category id sequence after rows are dragged', async () => {
    const submit = vi.fn().mockResolvedValue(undefined);
    render(
      <NavigationCategorySortDialog
        open
        categories={categories}
        pending={false}
        onOpenChange={vi.fn()}
        onSubmit={submit}
      />,
    );

    expect(
      screen.getByRole('heading', { name: '分类排序' }).closest('[data-slot="sheet-content"]'),
    ).toBeTruthy();
    const source = screen.getByRole('listitem', { name: '文档' });
    const target = screen.getByRole('listitem', { name: '工具' });
    vi.spyOn(source, 'getBoundingClientRect').mockReturnValue(new DOMRect(10, 40, 240, 44));
    fireEvent(
      source,
      new MouseEvent('pointerdown', { bubbles: true, button: 0, clientX: 30, clientY: 50 }),
    );
    const preview = screen.getByTestId('navigation-category-drag-preview');
    expect(preview).toHaveTextContent('文档');
    expect(preview).toHaveStyle({ left: '10px', top: '40px', width: '240px' });
    fireEvent(window, new MouseEvent('pointermove', { bubbles: true, clientX: 80, clientY: 100 }));
    expect(preview).toHaveStyle({ left: '60px', top: '90px', width: '240px' });
    fireEvent.pointerEnter(target, { pointerId: 1 });
    fireEvent.pointerUp(target, { pointerId: 1 });
    fireEvent.click(screen.getByRole('button', { name: '保存排序' }));

    await waitFor(() =>
      expect(submit).toHaveBeenCalledWith([categories[2].id, categories[0].id, categories[1].id]),
    );
  });

  it('does not allow submitting an unchanged order', () => {
    render(
      <NavigationCategorySortDialog
        open
        categories={categories}
        pending={false}
        onOpenChange={vi.fn()}
        onSubmit={vi.fn()}
      />,
    );

    expect(screen.getByRole('button', { name: '保存排序' })).toBeDisabled();
    expect(screen.getByRole('listitem', { name: '工具' })).toHaveClass('bg-muted');
    expect(screen.getByRole('listitem', { name: '工具' })).not.toHaveClass('rounded-lg');
  });
});
