import { describe, expect, it } from 'vitest';
import { createQueryClient, QUERY_STALE_TIME_MS } from './query-provider';

describe('query client defaults', () => {
  it('reuses fresh data briefly while keeping focus refetch available after it becomes stale', () => {
    const client = createQueryClient();
    const defaults = client.getDefaultOptions();

    expect(defaults.queries?.staleTime).toBe(QUERY_STALE_TIME_MS);
    expect(defaults.queries?.refetchOnWindowFocus).not.toBe(false);
    expect(defaults.queries?.retry).toBe(1);
    expect(defaults.mutations?.retry).toBe(false);
  });

  it('reuses fresh results and refetches immediately after an explicit invalidation', async () => {
    const client = createQueryClient();
    let calls = 0;
    const queryKey = ['request-count'];
    const queryFn = async () => ++calls;

    await client.fetchQuery({ queryKey, queryFn });
    await client.fetchQuery({ queryKey, queryFn });
    expect(calls).toBe(1);

    await client.invalidateQueries({ queryKey });
    await client.fetchQuery({ queryKey, queryFn });
    expect(calls).toBe(2);
  });
});
