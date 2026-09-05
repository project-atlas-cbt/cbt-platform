import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useAttemptLock, type AttemptLockRole } from './use-attempt-lock';

/**
 * A minimal, faithful-enough fake of the Web Locks API for DoD 20 — jsdom
 * has no native implementation. Models exclusive-mode `ifAvailable`
 * (immediate `null` on contention, never queues) and ordinary queued
 * requests (including `signal`-based cancellation), which is exactly the
 * subset `use-attempt-lock.ts` uses.
 */
function createFakeLockManager() {
  const held = new Set<string>();
  const queues = new Map<
    string,
    {
      resolve: (v: unknown) => void;
      reject: (e: unknown) => void;
      callback: (lock: unknown) => unknown;
    }[]
  >();

  function grantNext(name: string) {
    if (held.has(name)) return;
    const queue = queues.get(name);
    const next = queue?.shift();
    if (!next) return;
    held.add(name);
    Promise.resolve()
      .then(() => next.callback({ name, mode: 'exclusive' }))
      .then(
        (result) => {
          held.delete(name);
          next.resolve(result);
          grantNext(name);
        },
        (error: unknown) => {
          held.delete(name);
          next.reject(error);
          grantNext(name);
        },
      );
  }

  return {
    request(
      name: string,
      optionsOrCallback: LockOptions | ((lock: unknown) => unknown),
      maybeCallback?: (lock: unknown) => unknown,
    ): Promise<unknown> {
      const options: LockOptions = typeof optionsOrCallback === 'function' ? {} : optionsOrCallback;
      const callback = (
        typeof optionsOrCallback === 'function' ? optionsOrCallback : maybeCallback
      ) as (lock: unknown) => unknown;

      if (options.ifAvailable && held.has(name)) {
        return Promise.resolve(callback(null));
      }

      return new Promise((resolve, reject) => {
        const entry = { resolve, reject, callback };
        const queue = queues.get(name) ?? [];
        queue.push(entry);
        queues.set(name, queue);
        if (options.signal) {
          options.signal.addEventListener('abort', () => {
            const q = queues.get(name);
            const idx = q?.indexOf(entry) ?? -1;
            if (q && idx >= 0) {
              q.splice(idx, 1);
              reject(new DOMException('aborted', 'AbortError'));
            }
          });
        }
        grantNext(name);
      });
    },
  };
}

describe('useAttemptLock', () => {
  beforeEach(() => {
    Object.defineProperty(navigator, 'locks', {
      value: createFakeLockManager(),
      configurable: true,
    });
  });
  afterEach(() => {
    Reflect.deleteProperty(navigator, 'locks');
    vi.useRealTimers();
  });

  it('the first tab to request the lock becomes leader', async () => {
    const { result } = renderHook(() => useAttemptLock('attempt-1', vi.fn()));
    await waitFor(() => expect(result.current.role).toBe('leader'));
  });

  it('DoD 20 — a second hook instance for the same attempt is blocked, never a second leader', async () => {
    const { result: first } = renderHook(() => useAttemptLock('attempt-1', vi.fn()));
    await waitFor(() => expect(first.current.role).toBe('leader'));

    const { result: second } = renderHook(() => useAttemptLock('attempt-1', vi.fn()));
    await waitFor(() => expect(second.current.role).toBe('blocked'));
    expect(first.current.role).toBe('leader');
  });

  it('requesting takeover triggers the leader to yield cooperatively, then the requester becomes leader', async () => {
    const onYield = vi.fn().mockResolvedValue(undefined);
    const { result: leader } = renderHook(() => useAttemptLock('attempt-2', onYield));
    await waitFor(() => expect(leader.current.role).toBe('leader'));

    const { result: waiter } = renderHook(() => useAttemptLock('attempt-2', vi.fn()));
    await waitFor(() => expect(waiter.current.role).toBe('blocked'));

    act(() => {
      waiter.current.requestTakeover();
    });

    await waitFor(() => expect(onYield).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(waiter.current.role).toBe('leader'));
    await waitFor(() => expect(leader.current.role).toBe('blocked'));
  });

  it('force-switch grants leadership without waiting for cooperation', async () => {
    vi.useFakeTimers();
    // A leader that never yields (its onYieldRequested promise never
    // resolves) — models an abandoned tab.
    const { result: leader } = renderHook(() =>
      useAttemptLock('attempt-3', () => new Promise(() => undefined)),
    );
    await act(async () => {
      await Promise.resolve();
    });
    expect(leader.current.role).toBe('leader');

    const { result: waiter } = renderHook(() => useAttemptLock('attempt-3', vi.fn()));
    await act(async () => {
      await Promise.resolve();
    });
    expect(waiter.current.role).toBe('blocked');

    act(() => {
      waiter.current.requestTakeover();
    });
    expect(waiter.current.canForceSwitch).toBe(false);

    act(() => {
      vi.advanceTimersByTime(20_000);
    });
    expect(waiter.current.canForceSwitch).toBe(true);

    act(() => {
      waiter.current.forceSwitch();
    });
    expect(waiter.current.role).toBe('leader');
  });

  it('bug fix — unmounting while a takeover request is still queued cancels it, freeing the lock for someone else', async () => {
    const { result: leader, unmount: unmountLeader } = renderHook(() =>
      useAttemptLock('attempt-4', vi.fn().mockResolvedValue(undefined)),
    );
    await waitFor(() => expect(leader.current.role).toBe('leader'));

    const { result: waiter, unmount: unmountWaiter } = renderHook(() =>
      useAttemptLock('attempt-4', vi.fn()),
    );
    await waitFor(() => expect(waiter.current.role).toBe('blocked'));

    act(() => {
      waiter.current.requestTakeover();
    });

    // The waiter's takeover request is now queued behind the leader —
    // unmount it (e.g. the student navigated away) before the leader ever
    // yields or unmounts itself.
    unmountWaiter();

    // The leader unmounting releases the lock. Before the fix, the
    // waiter's still-queued request (never aborted on its own unmount)
    // would be granted right here, to a component instance that no longer
    // exists — permanently marking the lock "held" with nothing left to
    // ever release it.
    unmountLeader();
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    // The lock must be genuinely free — a fresh instance can become
    // leader immediately, not stuck 'blocked' behind a phantom holder.
    const { result: fresh } = renderHook(() => useAttemptLock('attempt-4', vi.fn()));
    const freshRole: AttemptLockRole = await waitFor(() => {
      expect(fresh.current.role).not.toBe('pending');
      return fresh.current.role;
    });
    expect(freshRole).toBe('leader');
  });
});
