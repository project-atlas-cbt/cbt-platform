import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    // Synthesising every stack takes a few seconds per environment.
    testTimeout: 60_000,
  },
});
