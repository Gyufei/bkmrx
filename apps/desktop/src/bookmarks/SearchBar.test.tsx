// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';

import SearchBar from './SearchBar';

afterEach(cleanup);

it('submits an empty query when a cleared input loses focus', () => {
  const onSearch = vi.fn();
  render(<SearchBar onSearch={onSearch} loading={false} />);
  const input = screen.getByPlaceholderText('搜索书签...');
  fireEvent.change(input, { target: { value: 'existing query' } });
  fireEvent.keyDown(input, { key: 'Enter' });
  onSearch.mockClear();

  fireEvent.change(input, { target: { value: '' } });
  fireEvent.blur(input);

  expect(onSearch).toHaveBeenCalledOnce();
  expect(onSearch).toHaveBeenCalledWith('');
});

it('does not submit a non-empty query on blur', () => {
  const onSearch = vi.fn();
  render(<SearchBar onSearch={onSearch} loading={false} />);
  const input = screen.getByPlaceholderText('搜索书签...');

  fireEvent.change(input, { target: { value: 'not submitted' } });
  fireEvent.blur(input);

  expect(onSearch).not.toHaveBeenCalled();
});
