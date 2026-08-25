import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    // Exclude dist/ — this package now has a real build step (needed so
    // Turbopack can resolve it from apps/web), and the default include
    // pattern would otherwise also pick up compiled test files there,
    // running every test twice.
    include: ['src/**/*.test.ts'],
  },
});
