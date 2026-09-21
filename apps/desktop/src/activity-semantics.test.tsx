// @vitest-environment jsdom

import { act, cleanup, render } from '@testing-library/react';
import { Activity, useEffect, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import { afterEach, describe, expect, it } from 'vitest';

// Layout.tsx 用 <Activity> 常驻挂载全部面板。整个架构依赖其语义：
// 隐藏面板不跑 effect（不发请求、不注册监听），激活时补跑，状态保留。
// 此测试锁定该契约，防止将来换成 CSS 隐藏或依赖库行为变化时静默失效。

function Shell({ visible, children }: { visible: boolean; children: ReactNode }) {
  return <Activity mode={visible ? 'visible' : 'hidden'}>{children}</Activity>;
}

describe('Activity hidden semantics (layout contract)', () => {
  afterEach(cleanup);

  it('defers mount effects until visible, re-runs them on re-activation', () => {
    let effectCount = 0;
    function Probe() {
      useEffect(() => {
        effectCount += 1;
      }, []);
      return <div>probe</div>;
    }

    const { rerender } = render(<Shell visible={false}><Probe /></Shell>);
    expect(effectCount).toBe(0);

    act(() => rerender(<Shell visible><Probe /></Shell>));
    expect(effectCount).toBe(1);

    act(() => rerender(<Shell visible={false}><Probe /></Shell>));
    act(() => rerender(<Shell visible><Probe /></Shell>));
    expect(effectCount).toBe(2);
  });

  it('unmounts effects (runs cleanup) when hidden', () => {
    let cleanupCount = 0;
    function Probe() {
      useEffect(() => () => {
        cleanupCount += 1;
      }, []);
      return <div>probe</div>;
    }

    const { rerender } = render(<Shell visible><Probe /></Shell>);
    expect(cleanupCount).toBe(0);

    act(() => rerender(<Shell visible={false}><Probe /></Shell>));
    expect(cleanupCount).toBe(1);
  });

  it('does not fetch TanStack queries while hidden; fresh data is not refetched on re-activation', () => {
    let fetchCount = 0;
    function QueryProbe() {
      useQuery({
        queryKey: ['activity-contract-probe'],
        queryFn: async () => {
          fetchCount += 1;
          return 'ok';
        },
        staleTime: 30_000,
      });
      return <div>probe</div>;
    }

    const client = new QueryClient();
    const ui = (visible: boolean) => (
      <QueryClientProvider client={client}>
        <Shell visible={visible}><QueryProbe /></Shell>
      </QueryClientProvider>
    );

    const { rerender } = render(ui(false));
    expect(fetchCount).toBe(0);

    act(() => rerender(ui(true)));
    expect(fetchCount).toBe(1);

    act(() => rerender(ui(false)));
    act(() => rerender(ui(true)));
    expect(fetchCount).toBe(1);
  });
});
