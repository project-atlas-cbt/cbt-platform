import * as Sentry from '@sentry/node';
import { scrubText, scrubValue } from './redaction.js';

/**
 * B20 (09 §35: "Sentry becomes the developer-facing error/issue system").
 * Errors and operational alerts only — tracing stays with OpenTelemetry
 * (`enableOpenTelemetrySetup: false`, no traces sample rate), so the two never fight
 * over the global tracer provider. A no-op when `SENTRY_DSN` is unset
 * (local dev, CI). Every event is scrubbed before it leaves the process:
 * request bodies, cookies and headers are dropped outright; remaining
 * strings go through the same scrubber as log lines.
 */
let enabled = false;

export interface InitSentryOptions {
  dsn?: string | undefined;
  environment: string;
  serviceName: string;
  release?: string | undefined;
}

export function initSentry(options: InitSentryOptions): boolean {
  if (!options.dsn || enabled) return enabled;
  Sentry.init({
    dsn: options.dsn,
    environment: options.environment,
    ...(options.release && { release: options.release }),
    // Sentry v11's data-collection switches — all off: no user info,
    // cookies, headers, bodies or query strings leave the process.
    dataCollection: {
      userInfo: false,
      cookies: false,
      httpHeaders: false,
      httpBodies: [],
      urlQueryParams: false,
    },
    enableOpenTelemetrySetup: false,
    initialScope: { tags: { service: options.serviceName } },
    beforeSend(event) {
      return scrubSentryEvent(event);
    },
  });
  enabled = true;
  return true;
}

export function isSentryEnabled(): boolean {
  return enabled;
}

/** Exported for unit testing the scrubber without a live DSN. */
export function scrubSentryEvent<E extends Sentry.ErrorEvent>(event: E): E {
  if (event.request) {
    delete event.request.data;
    delete event.request.cookies;
    delete event.request.headers;
    if (event.request.url) event.request.url = scrubText(event.request.url);
    if (event.request.query_string) delete event.request.query_string;
  }
  if (event.user) event.user = event.user.id ? { id: event.user.id } : {};
  if (event.message) event.message = scrubText(event.message);
  for (const ex of event.exception?.values ?? []) {
    if (ex.value) ex.value = scrubText(ex.value);
  }
  if (event.extra) event.extra = scrubValue(event.extra) as typeof event.extra;
  if (event.breadcrumbs) {
    event.breadcrumbs = event.breadcrumbs.map((b) => ({
      ...b,
      ...(b.message && { message: scrubText(b.message) }),
      ...(b.data && { data: scrubValue(b.data) as Record<string, unknown> }),
    }));
  }
  return event;
}

export function captureError(err: unknown, tags: Record<string, string> = {}): void {
  if (!enabled) return;
  Sentry.captureException(err, { tags });
}

export function captureAlert(
  message: string,
  level: 'warning' | 'error',
  tags: Record<string, string>,
): void {
  if (!enabled) return;
  Sentry.captureMessage(scrubText(message), { level, tags });
}

export async function flushSentry(timeoutMs = 2000): Promise<void> {
  if (enabled) await Sentry.flush(timeoutMs);
}
