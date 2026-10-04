import { execSync } from 'node:child_process';
import path from 'node:path';

/**
 * Builds fresh test data through the running API (B21's provisioning —
 * `tools/load/src/e2e-fixture.ts`) once the stack is up. Every run gets its
 * own school, so suites never depend on leftovers from a previous run.
 */
export default function globalSetup(): void {
  if (process.env.E2E_SKIP_FIXTURE === 'true') return;
  const repoRoot = path.resolve(import.meta.dirname, '../../..');
  execSync('pnpm --filter @atlas/load e2e-fixture', {
    cwd: repoRoot,
    stdio: 'inherit',
    env: {
      ...process.env,
      PLATFORM_ROOT_DOMAIN: 'localhost',
      E2E_API_TARGET: 'http://127.0.0.1:3001/v1',
    },
  });
}
