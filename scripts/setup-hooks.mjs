// Installs simple-git-hooks locally. Runs via the root "prepare" script after
// `pnpm install`. Skips quietly in CI or outside a git checkout — CI runs the
// same lint/format checks explicitly as pipeline steps instead.
import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';

const isCI = process.env.CI === 'true' || process.env.CI === '1';
const hasGitDir = existsSync('.git');

if (isCI || !hasGitDir) {
  console.log('[setup-hooks] skipped (CI or no .git directory present)');
  process.exit(0);
}

try {
  execSync('pnpm exec simple-git-hooks', { stdio: 'inherit' });
} catch (err) {
  console.warn('[setup-hooks] could not install git hooks:', err.message);
}
