import { defineConfig } from 'vitest/config';

// Requires live infrastructure (docker compose up) — see integration/README.md.
// Never part of the plain `pnpm test` unit run.
export default defineConfig({
  test: {
    environment: 'node',
    setupFiles: ['./vitest.setup.ts'],
    include: ['**/*.integration.test.ts'],
    testTimeout: 30_000,
    hookTimeout: 60_000,
    fileParallelism: false,
  },
});
