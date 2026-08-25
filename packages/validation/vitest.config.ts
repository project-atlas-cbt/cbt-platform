import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    // Exclude dist/ — this package has a real build step (needed so
    // apps/api/apps/worker can run it via plain `node`, not just tsx —
    // see CLAUDE.md's 2026-08-25 change-log entry), and the default
    // include pattern would otherwise also pick up compiled test files
    // there, running every test twice.
    include: ['src/**/*.test.ts'],
  },
});
