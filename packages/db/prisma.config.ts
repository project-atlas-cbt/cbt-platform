import { defineConfig } from 'prisma/config';
import { loadRootEnv } from '@atlas/config';

// See apps/api/src/config/app-config.module.ts for why this isn't a bare
// `import 'dotenv/config'` — the Prisma CLI's cwd is packages/db, and the
// project's one .env file lives at the repo root.
loadRootEnv();

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    seed: 'tsx prisma/seed.ts',
  },
  // Prisma 7: Migrate reads the connection URL from here, not from
  // schema.prisma. DATABASE_URL_TEST lets the migration integration test
  // (tests/integration/migrations.integration.test.ts) point the CLI at
  // an ephemeral database by overriding process.env.DATABASE_URL before
  // invoking it — see that test for how.
  datasource: {
    url: process.env.DATABASE_URL ?? '',
  },
});
