import { defineConfig, devices } from '@playwright/test';

/**
 * F20 — the web app's browser suites (accessibility, keyboard, CSP and
 * headers, constrained network, precache, low-end profile, browser matrix).
 * The first browser harness in the repository; see `e2e/README.md`.
 *
 * Runs against PRODUCTION builds (`pnpm build` first): the service worker,
 * the nonce CSP and the bundle are what ships, not what `next dev` serves.
 * The stack uses `<school>.localhost` hosts — a secure context in Chromium
 * and Firefox, so the service worker, Cache Storage and Web Crypto behave as
 * they do over https.
 */

const ROOT = 'localhost';
const API_PORT = 3001;
const WEB_PORT = 3000;
const MINIO = process.env.E2E_S3_ENDPOINT ?? 'http://localhost:9000';

const apiEnv: Record<string, string> = {
  NODE_ENV: 'development',
  API_PORT: String(API_PORT),
  PLATFORM_ROOT_DOMAIN: ROOT,
  WEB_ORIGIN: `http://${ROOT}:${WEB_PORT}`,
  S3_ENDPOINT: MINIO,
  S3_BUCKET: process.env.E2E_S3_BUCKET ?? 'atlas-media-dev',
  S3_ACCESS_KEY_ID: process.env.E2E_S3_ACCESS_KEY_ID ?? 'atlas_minio_root',
  S3_SECRET_ACCESS_KEY: process.env.E2E_S3_SECRET_ACCESS_KEY ?? 'atlas_minio_dev_password',
  S3_REGION: 'us-east-1',
  // Sign-in heavy suites from one machine; the B20 lab profile is proven by
  // the API security suite, not here.
  RATE_LIMIT_AUTH_IP_MAX: '5000',
  RATE_LIMIT_AUTH_IDENTIFIER_MAX: '200',
  // F20 default: Software Admins must enrol — exercised by mfa.spec.ts.
  PLATFORM_MFA_REQUIRED: 'true',
  LOG_LEVEL: 'warn',
};

export default defineConfig({
  testDir: './e2e',
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  globalSetup: './e2e/global-setup.ts',
  use: {
    viewport: { width: 1366, height: 768 },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1366, height: 768 } },
    },
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'], viewport: { width: 1366, height: 768 } },
      grep: /@matrix/,
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'], viewport: { width: 1366, height: 768 } },
      grep: /@matrix/,
    },
  ],
  webServer: [
    {
      command: 'node ../api/dist/main.js',
      url: `http://127.0.0.1:${API_PORT}/v1/health`,
      env: apiEnv,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      stdout: 'ignore',
      stderr: 'pipe',
    },
    {
      command: `pnpm exec next start -p ${WEB_PORT}`,
      url: `http://127.0.0.1:${WEB_PORT}/manifest.webmanifest`,
      env: { NEXT_PUBLIC_MEDIA_ORIGIN: MINIO, NODE_ENV: 'production' },
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
  ],
});
