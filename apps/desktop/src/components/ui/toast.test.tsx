// @vitest-environment jsdom

import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { toast, Toaster } from './toast';

afterEach(cleanup);

describe('Base UI toast', () => {
  it('renders notifications created by the shared toast manager', async () => {
    render(<Toaster />);

    await act(async () => {
      toast.add({ title: '保存失败', type: 'error' });
    });

    expect(await screen.findByText('保存失败')).toBeTruthy();
    expect(screen.getByRole('dialog', { name: '保存失败' }).getAttribute('data-type')).toBe('error');
  });
});
