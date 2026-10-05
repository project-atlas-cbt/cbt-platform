// F21 (DoD 5–6): keeps a copy of the current production build of this app
// as "the previous release", so the deployment browser suite
// (e2e/deployment.spec.ts) can serve it next to a newer build and switch
// between them mid-exam, the way a real deployment does.
//
//   node scripts/snapshot-build.mjs <dest>    e.g. ../../.e2e-deploy/previous
//
// <dest> must sit two levels below the repository root, like apps/web:
// pnpm's node_modules links are relative, and next.config.ts loads
// ../../.env. The build cache (.next/cache) is left out.
import { cpSync, existsSync, readFileSync, rmSync } from 'node:fs';
import path from 'node:path';

const here = path.resolve(import.meta.dirname, '..');
if (!process.argv[2]) throw new Error('usage: snapshot-build.mjs <dest>');
const dest = path.resolve(process.cwd(), process.argv[2]);
if (dest === here || path.resolve(dest, '../..') !== path.resolve(here, '../..'))
  throw new Error(`${dest} must be two levels below the repository root, beside apps/web`);
const buildIdFile = path.join(here, '.next/BUILD_ID');
if (!existsSync(buildIdFile)) throw new Error('no production build here: run `pnpm build` first');

const cache = path.join(here, '.next/cache');
rmSync(dest, { recursive: true, force: true });
for (const entry of ['.next', 'public', 'node_modules', 'package.json', 'next.config.ts']) {
  cpSync(path.join(here, entry), path.join(dest, entry), {
    recursive: true,
    verbatimSymlinks: true,
    filter: (src) => !src.startsWith(cache),
  });
}
console.log(`build ${readFileSync(buildIdFile, 'utf8').trim()} copied to ${dest}`);
