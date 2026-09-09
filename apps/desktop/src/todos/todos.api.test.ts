import { QueryClient } from '@tanstack/react-query';
import { describe, expect, it } from 'vitest';
import { invalidateTodoQueries, TODO_TAGS_QUERY_KEY, todoQueryKey } from './todos.api';
import { todoTagId } from '@/test-utils/identity';

describe('todo query keys', () => {
  it('keeps tag and status filters in the cache key', () => {
    const tagId = todoTagId(7);
    expect(todoQueryKey({ status: 'completed', tag_id: tagId })).toEqual([
      'todos',
      { status: 'completed', tag_id: tagId },
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
