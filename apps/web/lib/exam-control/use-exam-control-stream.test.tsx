import { describe, expect, it, vi } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useExamControlStream, type EventSourceLike } from './sse-client';

/**
 * F12 — proves the hook writes every real snapshot directly into the
 * `['exam-control', examId]` query-cache entry via `queryClient
 * .setQueryData` (the core design decision letting `useExamControl`'s poll
 * and this stream cooperate rather than compete — see `queries.ts`'s doc
 * comment).
 */
function makeFakeSource() {
  const listeners: Record<string, ((event: Event) => void)[]> = {};
  const source: EventSourceLike = {
    addEventListener: (type, listener) => {
      (listeners[type] ??= []).push(listener);
    },
    removeEventListener: (type, listener) => {
      listeners[type] = (listeners[type] ?? []).filter((l) => l !== listener);
    },
    close: vi.fn(),
    readyState: 1,
  };
  return {
    source,
    emitMessage: (data: unknown) => {
      for (const listener of listeners.message ?? []) {
        listener({ data: JSON.stringify(data) } as MessageEvent);
      }
    },
  };
}

function TestHarness({ examId, factory }: { examId: string; factory: () => EventSourceLike }) {
  useExamControlStream(examId, factory);
  return null;
}

describe('useExamControlStream', () => {
  it('writes each real snapshot into the ["exam-control", examId] cache entry', async () => {
    const client = new QueryClient();
    const fake = makeFakeSource();
    render(
      <QueryClientProvider client={client}>
        <TestHarness examId="exam-1" factory={() => fake.source} />
      </QueryClientProvider>,
    );

    fake.emitMessage({ examId: 'exam-1', examStatus: 'OPEN' });

    await waitFor(() => {
      expect(client.getQueryData(['exam-control', 'exam-1'])).toEqual({
        examId: 'exam-1',
        examStatus: 'OPEN',
      });
    });
  });

  it('closes the connection on unmount', () => {
    const client = new QueryClient();
    const fake = makeFakeSource();
    const closeSpy = vi.spyOn(fake.source, 'close');
    const { unmount } = render(
      <QueryClientProvider client={client}>
        <TestHarness examId="exam-1" factory={() => fake.source} />
      </QueryClientProvider>,
    );
    unmount();
    expect(closeSpy).toHaveBeenCalled();
  });
});
