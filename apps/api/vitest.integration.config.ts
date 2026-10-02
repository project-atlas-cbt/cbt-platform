import { defineConfig } from 'vitest/config';

// Integration tests need a live Postgres + Redis (docker compose up) and
// DATABASE_URL_TEST / REDIS_URL set — see tests/integration/README.md.
// Kept as a separate config/script (test:integration) so `pnpm test` alone
// never requires infrastructure.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.integration.test.ts'],
    // B20: the security suites have their own config/job (test:security).
    exclude: ['**/node_modules/**', 'src/**/*.security.integration.test.ts'],
    testTimeout: 30_000,
    hookTimeout: 30_000,
    fileParallelism: false,
  },
});
