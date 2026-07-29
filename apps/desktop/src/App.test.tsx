// @vitest-environment jsdom

import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mediaHarness = vi.hoisted(() => {
  let listener: (() => void) | null = null;
  const query = {
    matches: false,
    addEventListener: vi.fn((_event: string, next: () => void) => {
      listener = next;
    }),
    removeEventListener: vi.fn(),
  };
  return {
    query,
    emitChange: () => listener?.(),
  };
});

vi.mock('./Layout', () => ({
  default: () => <div>Layout</div>,
}));

import App from './App';

describe('App', () => {
  beforeEach(() => {
    mediaHarness.query.matches = false;
    vi.stubGlobal(
      'matchMedia',
      vi.fn(() => mediaHarness.query),
    );
    document.documentElement.classList.remove('dark');
  });

  afterEach(() => {
    cleanup();
    document.documentElement.classList.remove('dark');
    vi.unstubAllGlobals();
  });

  it('mirrors system color-scheme changes on the document root', () => {
    render(<App />);

    mediaHarness.query.matches = true;
    act(() => mediaHarness.emitChange());

    expect(document.documentElement.classList.contains('dark')).toBe(true);
  });
});
