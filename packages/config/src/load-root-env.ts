import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { config as dotenvConfig } from 'dotenv';
import { composeConnectionUrls } from './connection-urls.js';

/**
 * pnpm/turbo run each app's scripts with that app's own directory as
 * `cwd`, so a bare `dotenv.config()` in apps/api or apps/worker would look
 * for `apps/api/.env` — never found, since the project keeps one `.env` at
 * the repo root (README "Quick start": `cp .env.example .env`). This walks
 * up from `cwd` to the workspace root (marked by `pnpm-workspace.yaml`)
 * and loads `.env` from there instead.
 *
 * A no-op if no `.env` file exists — CI sets real environment variables
 * directly and never creates one, which is the intended path there.
 */
export function loadRootEnv(startDir: string = process.cwd()): void {
  let dir = resolve(startDir);
  for (let i = 0; i < 8; i++) {
    if (existsSync(join(dir, 'pnpm-workspace.yaml'))) {
      const envPath = join(dir, '.env');
      if (existsSync(envPath)) {
        // quiet: dotenv's banner goes to stdout, which an operator CLI's
        // output (ops:fix-name-order's review CSV) must not carry.
        dotenvConfig({ path: envPath, quiet: true });
      }
      composeConnectionUrls();
      return;
    }
    const parent = dirname(dir);
    if (parent === dir) break; // reached filesystem root without finding it
    dir = parent;
  }
  composeConnectionUrls();
}
