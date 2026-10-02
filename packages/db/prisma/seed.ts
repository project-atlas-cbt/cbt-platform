/**
 * Seed harness. B0 defined its own scope — a school to exercise the
 * tenancy convention against. B3 appends a Software Admin bootstrap: the
 * first platform account, which nothing in the product itself can create
 * (no spec describes Software Admin signup — it's an ops-provisioned
 * account, not a self-service one). Later phases append their own seed
 * steps here rather than replacing this file wholesale.
 */
import { hash, type Algorithm } from '@node-rs/argon2';
import { createPrismaClient } from '../src/client.js';

const prisma = createPrismaClient();
// B20: platform authority (platform_role_assignments) is no longer
// writable by the runtime role — creating the first Software Admin is an
// operator action, so it runs on the schema-owner connection.
const owner = createPrismaClient(process.env.DATABASE_URL);

// Mirrors apps/api/src/modules/identity/password.service.ts's Argon2id
// profile exactly (same reasoning as this codebase's other "convention
// reuse, not literal code sharing" precedents — e.g. PlatformSessionService
// vs SessionService's cookie signing) — packages/db cannot import from
// apps/api (wrong dependency direction), so the OWASP-recommended
// parameters are duplicated here rather than pulled in.
const ARGON2ID = 2 as Algorithm;
const ARGON2_OPTIONS = { algorithm: ARGON2ID, memoryCost: 19456, timeCost: 2, parallelism: 1 };

async function main() {
  const school = await prisma.school.upsert({
    where: { subdomain: 'demo' },
    update: {},
    create: {
      name: 'Demo Secondary School',
      subdomain: 'demo',
      timezone: 'Africa/Lagos',
    },
  });
  console.log(`[seed] school ready: ${school.id} (${school.subdomain})`);

  // Dev/ops bootstrap only — never how a real Software Admin account is
  // provisioned in production (see PlatformAuthGuard's own doc comment: no
  // forced-password-change gate exists for platform accounts in B3's
  // scope, so this ships with a directly-usable password, not a
  // MUST_CHANGE_PASSWORD one). Idempotent: safe to re-run.
  const email = process.env.SEED_SOFTWARE_ADMIN_EMAIL ?? 'admin@atlas.local';
  // B20: the dev default is only ever used for a development database; any
  // other environment must supply its own password explicitly.
  const isDevelopment = (process.env.NODE_ENV ?? 'development') === 'development';
  const password =
    process.env.SEED_SOFTWARE_ADMIN_PASSWORD ?? (isDevelopment ? 'ChangeMe123!DevOnly' : undefined);
  if (!password) {
    throw new Error('SEED_SOFTWARE_ADMIN_PASSWORD is required outside NODE_ENV=development.');
  }

  const existing = await owner.user.findFirst({
    where: { email, platformRoleAssignments: { some: { status: 'ACTIVE' } } },
  });

  if (existing) {
    console.log(`[seed] software admin already exists: ${existing.id}`);
  } else {
    const passwordHash = await hash(password, ARGON2_OPTIONS);
    const admin = await owner.user.create({
      data: {
        firstName: 'Software',
        lastName: 'Admin',
        displayName: 'Software Admin',
        email,
        passwordHash,
        status: 'ACTIVE',
        credentialState: 'OK',
        platformRoleAssignments: { create: { role: 'SOFTWARE_ADMIN' } },
      },
    });
    console.log(`[seed] software admin created: ${admin.id}`);
    // B20 log hygiene: the password is never printed. In development it is
    // the documented default (or SEED_SOFTWARE_ADMIN_PASSWORD if set).
    if (!process.env.SEED_SOFTWARE_ADMIN_PASSWORD) {
      console.log('[seed] using the documented development default password (see seed.ts).');
    }
  }
}

main()
  .catch((err) => {
    console.error('[seed] failed:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
    await owner.$disconnect();
  });
