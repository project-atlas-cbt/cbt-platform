import { defineConfig } from 'vitest/config';

// Mirrors apps/api/vitest.integration.config.ts exactly — integration tests
// need a live Postgres + Redis (docker compose up) and DATABASE_URL_TEST /
// DATABASE_APP_URL_TEST / REDIS_URL set. Kept as a separate config/script
// (test:integration) so `pnpm test` alone never requires infrastructure.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.integration.test.ts'],
    testTimeout: 30_000,
    hookTimeout: 30_000,
    fileParallelism: false,
  },
});
