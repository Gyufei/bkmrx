import { QueryClient } from '@tanstack/react-query';
import { describe, expect, it } from 'vitest';
import { invalidateTodoQueries, TODO_TAGS_QUERY_KEY, todoQueryKey } from './todos.api';

describe('todo query keys', () => {
  it('keeps tag and status filters in the cache key', () => {
    expect(todoQueryKey({ status: 'completed', tag_id: 7 })).toEqual([
      'todos',
      { status: 'completed', tag_id: 7 },
    ]);
  });

  it('invalidates todo lists and tags without touching other domains', async () => {
    const client = new QueryClient();
    const todoKey = todoQueryKey({ status: null, tag_id: null });
    const unrelatedKey = ['settings'];
    client.setQueryData(todoKey, { items: [] });
    client.setQueryData(TODO_TAGS_QUERY_KEY, []);
    client.setQueryData(unrelatedKey, {});

    await invalidateTodoQueries(client);

    expect(client.getQueryState(todoKey)?.isInvalidated).toBe(true);
    expect(client.getQueryState(TODO_TAGS_QUERY_KEY)?.isInvalidated).toBe(true);
    expect(client.getQueryState(unrelatedKey)?.isInvalidated).toBe(false);
  });
});
