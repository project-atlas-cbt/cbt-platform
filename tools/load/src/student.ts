import { randomUUID } from 'node:crypto';
import http from 'node:http';
import { performance } from 'node:perf_hooks';
import { Client, NetworkFailure, fetchAbsolute, type Target } from './http.js';
import type { Recorder } from './metrics.js';

/**
 * One virtual student, modelled on the F13 exam client
 * (apps/web/lib/attempt/sync-engine.ts + use-attempt-sync-engine.ts) so the
 * load is the load the real client generates:
 *
 * - answers are recorded locally first, then flushed through
 *   `POST /attempts/:id/answers/batch` with every pending row; at most one
 *   flush is in flight (the client's serialised flush chain);
 * - per-question monotonic sequence numbers (ADR-0007);
 * - a heartbeat tick every `heartbeatMs` (F13: 30 s) that also flushes;
 * - no debounce and no retry backoff — exactly the current client, which is
 *   part of what B21 measures (ADR-0032; F20 owns any change).
 */

export interface PackageQuestion {
  examQuestionId: string;
  options: { optionId: string }[];
  media: { url: string; mediaAssetId?: string }[];
}

function mediaAssetIdOf(media: { url: string; mediaAssetId?: string }): string {
  return media.mediaAssetId ?? media.url;
}

interface AttemptPackage {
  attemptId: string;
  state: string;
  expiresAt: string;
  questions: PackageQuestion[];
  /** F20: the exam's pre-cache key — only in the student's own package. */
  mediaKey?: string | null;
}

interface MediaManifest {
  ready: boolean;
  assets: { mediaAssetId: string; url: string; byteSize: number }[];
}

export interface StudentOptions {
  target: Target;
  host: string;
  sourceIp: string;
  identifier: string;
  password: string;
  examId: string;
  recorder: Recorder;
  heartbeatMs: number;
  /** Mean seconds between answer changes (the write-pressure knob: 08 §20). */
  answerIntervalMs: number;
  /** Rewrites signed media URLs to this address (the harness may run in a container). */
  mediaHost?: { address: string; port: number } | undefined;
}

interface Pending {
  selectedOptionId: string;
  sequenceNumber: number;
}

export class VirtualStudent {
  readonly client: Client;
  attemptId: string | undefined;
  questions: PackageQuestion[] = [];
  /** Last selection the server *acknowledged* per question — the no-lost-answer oracle. */
  readonly acked = new Map<string, { selectedOptionId: string; sequenceNumber: number }>();
  private readonly sequence = new Map<string, number>();
  private readonly pending = new Map<string, Pending>();
  private flushing: Promise<void> | undefined;
  private stopped = false;
  private heartbeatTimer: NodeJS.Timeout | undefined;
  private answerTimer: NodeJS.Timeout | undefined;
  errors: string[] = [];
  windowClosed = false;
  /** F20: asset ids whose encrypted copy this student already holds. */
  readonly precached = new Set<string>();
  mediaKey: string | null | undefined;
  signedInAt?: number;
  readyAt?: number;

  constructor(private readonly o: StudentOptions) {
    this.client = new Client(o.target, o.host, o.sourceIp, o.recorder, randomUUID());
  }

  /** Lab arrival: boot the app, sign in, open the dashboard and the exam preview. */
  async signIn(): Promise<void> {
    await this.client.resolveTenant();
    const res = await this.client.login(this.o.identifier, this.o.password);
    if (res.status !== 200) throw new Error(`login ${res.status}: ${res.raw.slice(0, 200)}`);
    await this.client.request('GET', '/student/assessment', { label: 'student.assessment' });
    await this.client.request('GET', `/student/assessment/${this.o.examId}/preview`, {
      label: 'student.preview',
    });
    this.signedInAt = performance.now();
  }

  /**
   * F20 — the preview's encrypted pre-cache (apps/web/lib/attempt/
   * media-precache.ts): poll the pre-start manifest until the server has
   * encrypted the paper, then download every ciphertext, three at a time as
   * the web client does. Returns the bytes downloaded.
   */
  async precache(): Promise<number> {
    let manifest: MediaManifest | undefined;
    for (let poll = 0; poll < 60; poll += 1) {
      const res = await this.client.request<MediaManifest>(
        'GET',
        `/student/assessment/${this.o.examId}/media-manifest`,
        { label: 'precache.manifest' },
      );
      if (res.status !== 200) throw new Error(`manifest ${res.status}: ${res.raw.slice(0, 200)}`);
      if (res.body.ready) {
        manifest = res.body;
        break;
      }
      await new Promise((r) => setTimeout(r, 2_000));
    }
    if (!manifest) throw new Error('pre-cache manifest never became ready');
    const agent = new http.Agent({ keepAlive: true, maxSockets: 3 });
    let bytes = 0;
    try {
      const queue = [...manifest.assets];
      await Promise.all(
        Array.from({ length: 3 }, async () => {
          for (let asset = queue.shift(); asset; asset = queue.shift()) {
            // Up to two retries per asset, as the web client
            // (MAX_RETRIES_PER_ASSET in media-precache.ts).
            for (let attempt = 0; ; attempt += 1) {
              try {
                bytes += await fetchAbsolute(
                  asset.url,
                  agent,
                  this.o.recorder,
                  'media.precache',
                  this.o.mediaHost,
                );
                break;
              } catch (error) {
                if (attempt >= 2) throw error;
              }
            }
            this.precached.add(asset.mediaAssetId);
          }
        }),
      );
    } finally {
      agent.destroy();
    }
    return bytes;
  }

  /** `POST /exams/:id/attempts` — returns the package; F13 then caches every media file (ADR-0021). */
  async start(opts: { fetchMedia: boolean } = { fetchMedia: true }): Promise<number> {
    const res = await this.client.request<AttemptPackage>(
      'POST',
      `/exams/${this.o.examId}/attempts`,
      {
        label: 'attempt.start',
        body: {},
      },
    );
    if (res.status !== 200) throw new Error(`start ${res.status}: ${res.raw.slice(0, 200)}`);
    this.attemptId = res.body.attemptId;
    this.questions = res.body.questions;
    this.mediaKey = res.body.mediaKey;
    if (opts.fetchMedia) {
      // With the pre-cache key, pre-cached assets are decrypted locally (no
      // network); anything not pre-cached is fetched as F13 always did.
      const local = this.mediaKey ? this.precached : new Set<string>();
      const urls = [
        ...new Set(
          this.questions.flatMap((q) =>
            q.media.filter((m) => !local.has(mediaAssetIdOf(m))).map((m) => m.url),
          ),
        ),
      ];
      const agent = new http.Agent({ keepAlive: true, maxSockets: 4 });
      try {
        await Promise.all(
          urls.map((url) =>
            fetchAbsolute(url, agent, this.o.recorder, 'media.get', this.o.mediaHost),
          ),
        );
      } finally {
        agent.destroy();
      }
    }
    this.readyAt = performance.now();
    return res.status;
  }

  /** Answer continuously until `stop()`; heartbeat on its own timer. */
  run(): void {
    this.stopped = false;
    const tick = () => {
      if (this.stopped) return;
      void this.heartbeat();
      // ±10 % jitter on every tick, not only the first: a fixed interval
      // keeps any phase alignment forever. B21's second endurance run lost
      // its spread to a 6 s load-generator stall (every overdue timer fired
      // together) and then beat 1,000 heartbeats in lockstep every 30 s for
      // the rest of the hour. The F20 web client needs the same jitter: a lab
      // released together otherwise heartbeats in phase for the whole exam.
      this.heartbeatTimer = setTimeout(tick, this.o.heartbeatMs * (0.9 + Math.random() * 0.2));
    };
    // Spread first heartbeats so a lab doesn't beat in lockstep.
    this.heartbeatTimer = setTimeout(tick, Math.random() * this.o.heartbeatMs);
    const answerLoop = () => {
      if (this.stopped) return;
      this.answerOne();
      // Exponential think time: a Poisson process of answer changes.
      const wait = -Math.log(1 - Math.random()) * this.o.answerIntervalMs;
      this.answerTimer = setTimeout(answerLoop, Math.min(wait, this.o.answerIntervalMs * 6));
    };
    this.answerTimer = setTimeout(answerLoop, Math.random() * this.o.answerIntervalMs);
  }

  stop(): void {
    this.stopped = true;
    if (this.heartbeatTimer) clearTimeout(this.heartbeatTimer);
    if (this.answerTimer) clearTimeout(this.answerTimer);
  }

  /** Mostly answers the next unanswered question; sometimes revises one (real students change answers). */
  answerOne(): void {
    if (!this.attemptId || this.questions.length === 0 || this.windowClosed) return;
    const unanswered = this.questions.filter((q) => !this.sequence.has(q.examQuestionId));
    const q =
      unanswered.length > 0 && Math.random() > 0.15
        ? unanswered[0]!
        : this.questions[Math.floor(Math.random() * this.questions.length)]!;
    const option = q.options[Math.floor(Math.random() * q.options.length)]!;
    const seq = (this.sequence.get(q.examQuestionId) ?? 0) + 1;
    this.sequence.set(q.examQuestionId, seq);
    this.pending.set(q.examQuestionId, { selectedOptionId: option.optionId, sequenceNumber: seq });
    void this.flush();
  }

  /** At most one batch in flight; each flush sends everything pending at that moment. */
  flush(): Promise<void> {
    if (this.flushing) return this.flushing;
    if (this.pending.size === 0 || !this.attemptId) return Promise.resolve();
    const items = [...this.pending.entries()];
    this.pending.clear();
    this.flushing = (async () => {
      try {
        const res = await this.client.request<{
          results: { examQuestionId: string; accepted: boolean; rejectionCode?: string }[];
        }>('POST', `/attempts/${this.attemptId}/answers/batch`, {
          label: 'answer.batch',
          body: {
            answers: items.map(([examQuestionId, p]) => ({
              examQuestionId,
              selectedOptionId: p.selectedOptionId,
              sequenceNumber: p.sequenceNumber,
              source: 'online',
            })),
          },
        });
        if (res.status === 200) {
          const sent = new Map(items);
          for (const r of res.body.results) {
            const p = sent.get(r.examQuestionId)!;
            if (r.accepted || r.rejectionCode === 'ATTEMPT_ANSWER_SEQUENCE_STALE') {
              const prev = this.acked.get(r.examQuestionId);
              if (r.accepted && (!prev || prev.sequenceNumber <= p.sequenceNumber)) {
                this.acked.set(r.examQuestionId, { ...p });
              }
            } else if (r.rejectionCode === 'ATTEMPT_WRITE_WINDOW_CLOSED') {
              this.windowClosed = true;
            } else {
              this.requeue(r.examQuestionId, p);
            }
          }
        } else {
          for (const [id, p] of items) this.requeue(id, p);
          if (res.status === 409 || res.status === 422) this.windowClosed = true;
          else if (res.status >= 500 || res.status === 429) this.errors.push(`batch ${res.status}`);
        }
      } catch (err) {
        for (const [id, p] of items) this.requeue(id, p);
        if (err instanceof NetworkFailure) this.errors.push(`batch network: ${err.message}`);
        else throw err;
      } finally {
        this.flushing = undefined;
      }
    })();
    return this.flushing;
  }

  private requeue(examQuestionId: string, p: Pending): void {
    const newer = this.pending.get(examQuestionId);
    if (!newer || newer.sequenceNumber < p.sequenceNumber) this.pending.set(examQuestionId, p);
  }

  async heartbeat(): Promise<void> {
    if (!this.attemptId) return;
    try {
      await this.client.request('POST', `/attempts/${this.attemptId}/heartbeat`, {
        label: 'attempt.heartbeat',
        body: {},
      });
    } catch {
      // recorded by the client
    }
    await this.flush();
  }

  async event(type: 'TAB_HIDDEN' | 'WINDOW_BLUR'): Promise<void> {
    if (!this.attemptId) return;
    await this.client
      .request('POST', `/attempts/${this.attemptId}/events`, {
        label: 'attempt.event',
        body: { type, occurredAt: new Date().toISOString() },
      })
      .catch(() => undefined);
  }

  /** Final flush, then submit (retrying a network failure like F13's expiry retry). */
  async submit(): Promise<number> {
    this.stop();
    for (let i = 0; i < 5 && (this.pending.size > 0 || this.flushing); i++) {
      if (this.flushing) await this.flushing;
      await this.flush();
    }
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const res = await this.client.request('POST', `/attempts/${this.attemptId}/submit`, {
          label: 'attempt.submit',
        });
        return res.status;
      } catch (err) {
        if (!(err instanceof NetworkFailure) || attempt === 2) throw err;
      }
    }
    return 0;
  }

  /** Post-submit status poll (F13 SubmittedScreen: every 5 s) until marking completes. */
  async awaitMarking(pollMs: number, timeoutMs: number): Promise<number | undefined> {
    const started = performance.now();
    while (performance.now() - started < timeoutMs) {
      const res = await this.client
        .request<{ marking: { status: string } }>('GET', `/attempts/${this.attemptId}/status`, {
          label: 'attempt.status',
        })
        .catch(() => undefined);
      if (res?.status === 200 && res.body.marking.status === 'COMPLETE') {
        return performance.now() - started;
      }
      await new Promise((r) => setTimeout(r, pollMs));
    }
    return undefined;
  }

  close(): void {
    this.stop();
    this.client.close();
  }
}
