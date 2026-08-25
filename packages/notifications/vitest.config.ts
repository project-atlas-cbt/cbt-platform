import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    // Exclude dist/ — same reasoning as packages/validation's vitest.config.ts.
    include: ['src/**/*.test.ts'],
  },
});
