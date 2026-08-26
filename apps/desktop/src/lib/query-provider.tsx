import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

export const QUERY_STALE_TIME_MS = 30_000;

export function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: QUERY_STALE_TIME_MS,
        retry: 1,
      },
      mutations: {
        retry: false,
      },
    },
  });
}

const queryClient = createQueryClient();

export default function QueryProvider({ children }: { children: React.ReactNode }) {
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
