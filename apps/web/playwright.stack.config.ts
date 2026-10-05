import { defineConfig, devices } from '@playwright/test';

/**
 * F21 — browser checks against the CI stack (`infra/vps/ci/stack.sh`): the
 * pilot's own Compose stack with production configuration, reached over
 * https on `*.atlas.test` through Caddy. No servers are started here; the
 * stack must already be up, and the runner must trust infra/vps/certs/ca.crt
 * (CI adds it to the NSS database Chromium reads).
 */
const ROOT = process.env.STACK_ROOT ?? 'atlas.test';
const CHROMIUM_EXECUTABLE = process.env.E2E_CHROMIUM_EXECUTABLE;

export default defineConfig({
  testDir: './e2e/stack',
  timeout: 60_000,
  expect: { timeout: 15_000 },
  workers: 1,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    viewport: { width: 1366, height: 768 },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1366, height: 768 },
        launchOptions: {
          ...(CHROMIUM_EXECUTABLE ? { executablePath: CHROMIUM_EXECUTABLE } : {}),
          // Every stack host is Caddy on this machine.
          args: [`--host-resolver-rules=MAP ${ROOT} 127.0.0.1, MAP *.${ROOT} 127.0.0.1`],
        },
      },
    },
  ],
});
