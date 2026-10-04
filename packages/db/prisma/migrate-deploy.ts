/**
 * Production/local deploy wrapper: Prisma applies DDL as the schema owner,
 * then the restricted runtime role receives access to newly-created tables.
 * ALTER DEFAULT PRIVILEGES covers the ordinary case; reasserting grants here
 * repairs older databases whose defaults predate the role bootstrap.
 */
import { execFileSync } from 'node:child_process';
import { loadRootEnv } from '@atlas/config';
import { ensureRuntimeRoles, grantAppRole, grantAuditReaderRole } from '../src/grants.js';

loadRootEnv();

const ownerUrl = process.env.DATABASE_URL;
if (!ownerUrl) throw new Error('DATABASE_URL is required to deploy migrations.');

// B23: on a managed database (RDS) the runtime roles are created here from
// the Secrets Manager passwords the migration task is given; locally,
// infra/postgres/init.sql already created them and these are unset.
const appPassword = process.env.DATABASE_APP_PASSWORD;
const auditReaderPassword = process.env.DATABASE_AUDIT_READER_PASSWORD;
if (appPassword && auditReaderPassword) {
  await ensureRuntimeRoles(ownerUrl, { app: appPassword, auditReader: auditReaderPassword });
}

execFileSync('pnpm', ['exec', 'prisma', 'migrate', 'deploy'], {
  stdio: 'inherit',
  shell: process.platform === 'win32',
});

await grantAppRole(ownerUrl);
await grantAuditReaderRole(ownerUrl);
