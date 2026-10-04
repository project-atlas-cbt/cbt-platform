'use client';

import { scrubText, scrubValue } from '@atlas/observability/redaction';

/**
 * F20 (DoD 11; 09 §35) — client-side error tracking via Sentry, under the
 * same rules as the API's (`packages/observability/src/sentry.ts`): errors
 * only (no tracing, no session replay), every event scrubbed before it
 * leaves the browser with the API's own redaction rules, the user reduced
 * to an id, and no request bodies, cookies, headers or query strings —
 * answers and personal data never reach Sentry.
 *
 * The SDK is loaded with a dynamic `import()` only when
 * `NEXT_PUBLIC_SENTRY_DSN` is configured, after the page is interactive, so
 * it is never part of any route's first-load bundle (the exam route's
 * budget, DoD 6) and costs nothing when tracking is off.
 */

type SentryModule = typeof import('@sentry/browser');
type SentryEvent = import('@sentry/browser').ErrorEvent;

const DSN = process.env.NEXT_PUBLIC_SENTRY_DSN;

let sentry: SentryModule | null = null;
let loading: Promise<SentryModule | null> | null = null;
/** Errors raised before the SDK finished loading — replayed once it has. */
const pending: { error: unknown; context: ErrorContext }[] = [];
let tags: Record<string, string> = {};

export interface ErrorContext {
  /** e.g. 'exam-runtime', 'error-boundary', 'global-error'. */
  source: string;
  [key: string]: string;
}

/** Same shape of scrubbing as the API's `scrubSentryEvent`. */
export function scrubClientEvent<E extends SentryEvent>(event: E): E {
  if (event.request) {
    delete event.request.data;
    delete event.request.cookies;
    delete event.request.headers;
    delete event.request.query_string;
    if (event.request.url) event.request.url = scrubText(event.request.url.split('?')[0] ?? '');
  }
  if (event.user) event.user = event.user.id ? { id: event.user.id } : {};
  if (event.message) event.message = scrubText(event.message);
  for (const ex of event.exception?.values ?? []) {
    if (ex.value) ex.value = scrubText(ex.value);
  }
  if (event.extra) event.extra = scrubValue(event.extra) as typeof event.extra;
  if (event.breadcrumbs) {
    event.breadcrumbs = event.breadcrumbs
      // Console and UI-click breadcrumbs can carry question or answer text.
      .filter((b) => b.category !== 'console' && !b.category?.startsWith('ui.'))
      .map((b) => ({
        ...b,
        ...(b.message && { message: scrubText(b.message) }),
        ...(b.data && { data: scrubValue(b.data) as Record<string, unknown> }),
      }));
  }
  return event;
}

function load(): Promise<SentryModule | null> {
  if (!DSN || typeof window === 'undefined') return Promise.resolve(null);
  loading ??= import('@sentry/browser')
    .then((mod) => {
      mod.init({
        dsn: DSN,
        environment: process.env.NODE_ENV,
        ...(process.env.NEXT_PUBLIC_RELEASE_VERSION && {
          release: process.env.NEXT_PUBLIC_RELEASE_VERSION,
        }),
        // Sentry v11's data-collection switches — all off, exactly as the
        // API configures them: no user info, cookies, headers, bodies or
        // query strings.
        dataCollection: {
          userInfo: false,
          cookies: false,
          httpHeaders: false,
          httpBodies: [],
          urlQueryParams: false,
        },
        tracesSampleRate: 0,
        // Default integrations minus anything that records page content.
        integrations: (defaults) =>
          defaults.filter((i) => !['Replay', 'Feedback'].includes(i.name)),
        beforeSend: (event) => scrubClientEvent(event),
        initialScope: { tags: { service: 'atlas-web', ...tags } },
      });
      sentry = mod;
      for (const { error, context } of pending.splice(0)) {
        mod.captureException(error, { tags: context });
      }
      return mod;
    })
    .catch(() => null);
  return loading;
}

let started = false;

/** Starts tracking (idempotent). Called once from the root `ClientErrorTracking`.
 * Uncaught errors raised before the SDK has loaded are queued here and
 * replayed; after load, Sentry's own global handlers take over. */
export function initClientErrorTracking(): void {
  if (!DSN || started) return;
  started = true;
  const early = (event: ErrorEvent | PromiseRejectionEvent) => {
    if (sentry) return;
    const error: unknown = 'reason' in event ? event.reason : (event.error ?? event.message);
    pending.push({ error, context: { source: 'early-global' } });
  };
  window.addEventListener('error', early);
  window.addEventListener('unhandledrejection', early);
  const start = () => void load();
  if ('requestIdleCallback' in window) window.requestIdleCallback(start, { timeout: 5000 });
  else setTimeout(start, 2000);
}

/** Ids only — never names, identifiers or content. */
export function setErrorContext(next: Record<string, string | undefined>): void {
  const clean = Object.fromEntries(
    Object.entries(next).filter((entry): entry is [string, string] => Boolean(entry[1])),
  );
  tags = { ...tags, ...clean };
  sentry?.setTags(clean);
}

export function reportClientError(error: unknown, context: ErrorContext): void {
  if (!DSN) return;
  if (sentry) {
    sentry.captureException(error, { tags: context });
    return;
  }
  pending.push({ error, context });
  void load();
}

export function isClientErrorTrackingConfigured(): boolean {
  return Boolean(DSN);
}
