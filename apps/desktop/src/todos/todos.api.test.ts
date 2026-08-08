import { describe, expect, it } from 'vitest';
import { todoQueryKey } from './todos.api';

describe('todo query keys', () => {
  it('keeps tag and status filters in the cache key', () => {
    expect(todoQueryKey({ status: 'completed', tag_id: 7 })).toEqual([
      'todos',
      { status: 'completed', tag_id: 7 },
    ]);
  });
});
