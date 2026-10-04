/**
 * Runs before any application code in the browser (Next.js
 * `instrumentation-client`).
 *
 * F20 (CSP): zod v4 probes `new Function('')` — refused under our
 * `script-src` (no 'unsafe-eval') — when its object schemas are constructed,
 * which happens as modules load. It falls back safely, but each probe logs a
 * CSP violation, drowning real ones. zod reads its global config from
 * `globalThis.__zod_globalConfig` and only creates it if absent, so setting
 * `jitless` here, before zod loads, prevents the probe entirely.
 */
const g = globalThis as { __zod_globalConfig?: { jitless?: boolean } };
g.__zod_globalConfig = { ...g.__zod_globalConfig, jitless: true };
