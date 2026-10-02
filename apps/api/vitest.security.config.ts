import { defineConfig } from 'vitest/config';

// B20: the security suites (tenant isolation across every endpoint,
// privilege escalation across all six roles, sessions/CSRF, injection,
// uploads, headers, rate limits, MFA, log hygiene, trace coverage). Same
// live-infrastructure requirement as test:integration; run as their own
// CI job so a regression in them is a distinct, named merge blocker.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.security.integration.test.ts'],
    testTimeout: 300_000,
    hookTimeout: 300_000,
    fileParallelism: false,
  },
});
