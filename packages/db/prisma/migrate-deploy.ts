/**
 * Production/local deploy wrapper: Prisma applies DDL as the schema owner,
 * then the restricted runtime role receives access to newly-created tables.
 * ALTER DEFAULT PRIVILEGES covers the ordinary case; reasserting grants here
 * repairs older databases whose defaults predate the role bootstrap.
 */
import { execFileSync } from 'node:child_process';
import { loadRootEnv } from '@atlas/config';
import { grantAppRole, grantAuditReaderRole } from '../src/grants.js';

loadRootEnv();

const ownerUrl = process.env.DATABASE_URL;
if (!ownerUrl) throw new Error('DATABASE_URL is required to deploy migrations.');

execFileSync('pnpm', ['exec', 'prisma', 'migrate', 'deploy'], {
  stdio: 'inherit',
  shell: process.platform === 'win32',
});

await grantAppRole(ownerUrl);
await grantAuditReaderRole(ownerUrl);
