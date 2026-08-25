/**
 * Seed harness (B0 scope). Seeds only what B0 itself defines — a school to
 * exercise the tenancy convention against. Later phases append their own
 * seed steps here rather than replacing this file wholesale.
 */
import { createPrismaClient } from '../src/client.js';

const prisma = createPrismaClient();

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
}

main()
  .catch((err) => {
    console.error('[seed] failed:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
