import { loadRootEnv } from '@atlas/config';

// Vitest runs these files directly (no Nest bootstrap), so nothing else
// loads the repo-root .env before the test files' own top-level
// `process.env.X` reads run — see packages/config/src/load-root-env.ts.
loadRootEnv();
