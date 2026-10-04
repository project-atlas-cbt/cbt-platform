import { describe, expect, it, vi } from 'vitest';
import {
  ExamControlStreamConnection,
  STREAM_RECONNECT_BASE_MS,
  STREAM_RECONNECT_MAX_MS,
  streamReconnectDelay,
  type EventSourceLike,
} from './sse-client';

/**
 * F12 — pure unit tests of the connection class, against an injected fake
 * `EventSourceLike` (jsdom has no native `EventSource`). Proves the
 * `readyState` → status mapping this hook's whole design rests on.
 */
function makeFakeSource(): {
  source: EventSourceLike;
  emit: (type: 'message' | 'error', event?: Partial<MessageEvent>) => void;
  setReadyState: (state: 0 | 1 | 2) => void;
  close: ReturnType<typeof vi.fn>;
} {
  const listeners: Record<string, ((event: Event) => void)[]> = {};
  let readyState: 0 | 1 | 2 = 0;
  const close = vi.fn();
  const source: EventSourceLike = {
    addEventListener: (type, listener) => {
      (listeners[type] ??= []).push(listener);
    },
    removeEventListener: (type, listener) => {
      listeners[type] = (listeners[type] ?? []).filter((l) => l !== listener);
    },
    close,
    get readyState() {
      return readyState;
    },
  };
  return {
    source,
    emit: (type, event = {}) => {
      for (const listener of listeners[type] ?? []) {
        listener({ ...event, type } as Event);
      }
    },
    setReadyState: (state) => {
      readyState = state;
    },
    close,
  };
}

describe('ExamControlStreamConnection', () => {
  it('starts at "connecting"', () => {
    const fake = makeFakeSource();
    const connection = new ExamControlStreamConnection('url', () => fake.source, vi.fn());
    expect(connection.getSnapshot()).toBe('connecting');
  });

  it('moves to "live" on a real message and hands the parsed snapshot to onSnapshot', () => {
    const fake = makeFakeSource();
    const onSnapshot = vi.fn();
    const connection = new ExamControlStreamConnection('url', () => fake.source, onSnapshot);
    connection.start();
    fake.setReadyState(1);
    fake.emit('message', { data: JSON.stringify({ examId: 'e1', examStatus: 'OPEN' }) });
    expect(connection.getSnapshot()).toBe('live');
    expect(onSnapshot).toHaveBeenCalledWith({ examId: 'e1', examStatus: 'OPEN' });
  });

  it('a malformed frame never crashes the connection and does not call onSnapshot', () => {
    const fake = makeFakeSource();
    const onSnapshot = vi.fn();
    const connection = new ExamControlStreamConnection('url', () => fake.source, onSnapshot);
    connection.start();
    expect(() => fake.emit('message', { data: 'not json' })).not.toThrow();
    expect(onSnapshot).not.toHaveBeenCalled();
    // Still reports 'live' — a message genuinely arrived, even if malformed.
    expect(connection.getSnapshot()).toBe('live');
  });

  it('an error while the browser is still auto-retrying (readyState CONNECTING) maps to "reconnecting"', () => {
    const fake = makeFakeSource();
    const connection = new ExamControlStreamConnection('url', () => fake.source, vi.fn());
    connection.start();
    fake.setReadyState(0);
    fake.emit('error');
    expect(connection.getSnapshot()).toBe('reconnecting');
  });

  it('an error with readyState CLOSED (a permanently failed connection, e.g. a 403 before headers) maps to "closed-permanent"', () => {
    const fake = makeFakeSource();
    const connection = new ExamControlStreamConnection('url', () => fake.source, vi.fn());
    connection.start();
    fake.setReadyState(2);
    fake.emit('error');
    expect(connection.getSnapshot()).toBe('closed-permanent');
  });

  it('notifies subscribers on every state change', () => {
    const fake = makeFakeSource();
    const connection = new ExamControlStreamConnection('url', () => fake.source, vi.fn());
    connection.start();
    const listener = vi.fn();
    connection.subscribe(listener);
    fake.setReadyState(1);
    fake.emit('message', { data: '{}' });
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('unsubscribe stops further notifications', () => {
    const fake = makeFakeSource();
    const connection = new ExamControlStreamConnection('url', () => fake.source, vi.fn());
    connection.start();
    const listener = vi.fn();
    const unsubscribe = connection.subscribe(listener);
    unsubscribe();
    fake.emit('message', { data: '{}' });
    expect(listener).not.toHaveBeenCalled();
  });

  it('stop() closes the underlying source', () => {
    const fake = makeFakeSource();
    const connection = new ExamControlStreamConnection('url', () => fake.source, vi.fn());
    connection.start();
    connection.stop();
    expect(fake.close).toHaveBeenCalledTimes(1);
  });

  it('F20 (B21): reopens after a refused/closed stream, backing off with jitter', () => {
    vi.useFakeTimers();
    try {
      const sources = [makeFakeSource(), makeFakeSource(), makeFakeSource()];
      let opened = 0;
      const connection = new ExamControlStreamConnection(
        'url',
        () => sources[opened++]!.source,
        vi.fn(),
      );
      connection.start();
      sources[0]!.setReadyState(2);
      sources[0]!.emit('error');
      expect(connection.getSnapshot()).toBe('closed-permanent');
      expect(opened).toBe(1);
      vi.advanceTimersByTime(STREAM_RECONNECT_BASE_MS - 1);
      expect(opened).toBe(1); // never sooner than the server's hold
      vi.advanceTimersByTime(STREAM_RECONNECT_BASE_MS * 0.3 + 1);
      expect(opened).toBe(2);
      expect(connection.getSnapshot()).toBe('reconnecting');
      // A second refusal doubles the wait.
      sources[1]!.setReadyState(2);
      sources[1]!.emit('error');
      vi.advanceTimersByTime(STREAM_RECONNECT_BASE_MS * 1.3 + 1);
      expect(opened).toBe(2);
      vi.advanceTimersByTime(STREAM_RECONNECT_BASE_MS * 1.3);
      expect(opened).toBe(3);
      connection.stop();
    } finally {
      vi.useRealTimers();
    }
  });

  it('stop() cancels a pending reconnect', () => {
    vi.useFakeTimers();
    try {
      const fake = makeFakeSource();
      const factory = vi.fn(() => fake.source);
      const connection = new ExamControlStreamConnection('url', factory, vi.fn());
      connection.start();
      fake.setReadyState(2);
      fake.emit('error');
      connection.stop();
      vi.advanceTimersByTime(STREAM_RECONNECT_MAX_MS * 2);
      expect(factory).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('streamReconnectDelay caps growth', () => {
    expect(streamReconnectDelay(0, () => 0)).toBe(STREAM_RECONNECT_BASE_MS);
    expect(streamReconnectDelay(10, () => 0)).toBe(STREAM_RECONNECT_MAX_MS);
  });
});
