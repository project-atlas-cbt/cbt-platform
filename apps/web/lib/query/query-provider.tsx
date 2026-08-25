'use client';

import { useState, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

/**
 * TanStack Query is the server-state layer for administrative screens only
 * — never the active exam (doctrine/F0 scope: "the active exam does not
 * use TanStack Query", F13 owns its own offline-first state machine).
 *
 * Defaults tuned for the unreliable networks this product targets (`01
 * §10`): a short retry count instead of the library's default of 3 rapid
 * retries with no visible feedback, and `staleTime` above zero so
 * navigating between already-fetched admin screens doesn't refetch on
 * every mount — matching doctrine's "never block the whole screen for a
 * partial data failure" bias toward already-known-good data.
 */
function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        retry: 2,
        refetchOnWindowFocus: false,
      },
    },
  });
}

export function QueryProvider({ children }: { children: ReactNode }) {
  const [client] = useState(createQueryClient);
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
