import { EventEmitter } from 'node:events';
import { describe, expect, it, vi } from 'vitest';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { LoadMonitorService } from './load-monitor.service.js';
import { InFlightMiddleware } from './load-shedding.middleware.js';

const ID = '01a0feab-0000-7000-8000-000000000001';

function run(originalUrl: string, statusCode = 200) {
  const monitor = {
    requestStarted: vi.fn(),
    requestFinished: vi.fn(),
    reportingStarted: vi.fn(),
    reportingFinished: vi.fn(),
  };
  const mw = new InFlightMiddleware(monitor as unknown as LoadMonitorService);
  // What @fastify/middie hands Nest middleware: `url` rewritten to the mount
  // point, `originalUrl` the real path.
  const req = { url: '/', originalUrl } as unknown as FastifyRequest['raw'];
  const res = Object.assign(new EventEmitter(), { statusCode }) as unknown as FastifyReply['raw'];
  const next = vi.fn();
  mw.use(req, res, next);
  (res as unknown as EventEmitter).emit('finish');
  return { monitor, next };
}

describe('InFlightMiddleware (B21)', () => {
  it('times exam writes from the original URL, not the rewritten one', () => {
    const { monitor, next } = run(`/v1/attempts/${ID}/answers/batch`);
    expect(next).toHaveBeenCalledOnce();
    expect(monitor.requestStarted).toHaveBeenCalledOnce();
    expect(monitor.requestFinished).toHaveBeenCalledWith(expect.any(Number));
    expect(monitor.reportingStarted).not.toHaveBeenCalled();
  });

  it('counts reporting requests for the bulkhead and releases them on finish', () => {
    const { monitor } = run('/v1/analytics/school');
    expect(monitor.requestFinished).toHaveBeenCalledWith(undefined);
    expect(monitor.reportingStarted).toHaveBeenCalledOnce();
    expect(monitor.reportingFinished).toHaveBeenCalledOnce();
  });

  it('counts other requests without timing them', () => {
    const { monitor } = run('/v1/questions');
    expect(monitor.requestFinished).toHaveBeenCalledWith(undefined);
    expect(monitor.reportingStarted).not.toHaveBeenCalled();
  });

  it('does not count a refused exam-path request as exam traffic', () => {
    for (const status of [401, 403, 404, 409]) {
      const { monitor } = run(`/v1/attempts/${ID}/heartbeat`, status);
      expect(monitor.requestFinished).toHaveBeenCalledWith(undefined);
    }
    // A server error on the exam path is exam traffic in trouble — counted.
    expect(
      run(`/v1/attempts/${ID}/answers/batch`, 503).monitor.requestFinished,
    ).toHaveBeenCalledWith(expect.any(Number));
  });
});
