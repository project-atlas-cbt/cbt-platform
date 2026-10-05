import { defineConfig, devices } from '@playwright/test';

/**
 * Browser checks for the marketing site, against a production build
 * (`pnpm build` first): every page is static, so what ships is the build.
 */
const PORT = 3100;
// A pre-installed Chromium whose revision differs from this Playwright's
// (e.g. a sandboxed dev container); CI installs the matching browser.
const CHROMIUM_EXECUTABLE = process.env.E2E_CHROMIUM_EXECUTABLE;

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1366, height: 768 },
        ...(CHROMIUM_EXECUTABLE ? { launchOptions: { executablePath: CHROMIUM_EXECUTABLE } } : {}),
      },
    },
  ],
  webServer: {
    // Next's binary directly, not `pnpm exec next`: pnpm puts the server in
    // its own process group, so teardown left it running and the run never
    // exited (the same fix as apps/web/playwright.config.ts).
    command: `node node_modules/next/dist/bin/next start -p ${PORT}`,
    url: `http://localhost:${PORT}/robots.txt`,
    reuseExistingServer: !process.env.CI,
    // Unset on purpose: the form must fail safe when email isn't configured.
    env: { MARKETING_LEAD_EMAIL_PROVIDER: '' },
  },
});
