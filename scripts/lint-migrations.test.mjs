import assert from 'node:assert/strict';
import { test } from 'node:test';
import { checkMigration } from './lint-migrations.mjs';

const flagged = (sql) => checkMigration('m', sql).length > 0;

test('expand steps pass', () => {
  assert.equal(flagged('CREATE TABLE "a" ("id" UUID NOT NULL);'), false);
  assert.equal(flagged('ALTER TABLE "a" ADD COLUMN "b" TEXT;'), false);
  assert.equal(flagged('ALTER TABLE "a" ADD COLUMN "b" BOOLEAN NOT NULL DEFAULT false;'), false);
  assert.equal(flagged('CREATE INDEX "i" ON "a"("b");'), false);
  assert.equal(flagged('ALTER TYPE "S" ADD VALUE \'NEW\';'), false);
  assert.equal(flagged('-- DROP TABLE "a" was considered\nSELECT 1;'), false);
});

test('contract steps are flagged', () => {
  for (const sql of [
    'DROP TABLE "a";',
    'ALTER TABLE "a" DROP COLUMN "b";',
    'ALTER TABLE "a" RENAME COLUMN "b" TO "c";',
    'ALTER TABLE "a" RENAME TO "z";',
    'ALTER TABLE "a" ALTER COLUMN "b" SET DATA TYPE INTEGER;',
    'ALTER TABLE "a" ALTER COLUMN "b" TYPE INTEGER;',
    'ALTER TABLE "a"\n  ALTER COLUMN "b" SET NOT NULL;',
    'ALTER TABLE "a" ADD COLUMN "b" TEXT NOT NULL;',
    'DROP TYPE "S";',
    "ALTER TYPE \"S\" RENAME VALUE 'A' TO 'B';",
    'TRUNCATE "a";',
    'DELETE FROM "a";',
  ]) {
    assert.equal(flagged(sql), true, sql);
  }
});

test('a reasoned contract marker allows it; a bare marker does not', () => {
  assert.equal(
    flagged(
      '-- atlas:contract column unused since release 2026.10.1\nALTER TABLE "a" DROP COLUMN "b";',
    ),
    false,
  );
  assert.equal(flagged('-- atlas:contract\nALTER TABLE "a" DROP COLUMN "b";'), true);
});

test('history: the rule catches the contract steps earlier phases shipped pre-launch', async () => {
  const { checkDirectory } = await import('./lint-migrations.mjs');
  const all = checkDirectory(
    new URL('../packages/db/prisma/migrations', import.meta.url).pathname,
    '0',
  );
  // B16 reshaped exam_participations in one migration; fine before launch, a contract step after.
  assert.ok(all.some((f) => f.startsWith('20260916090000_b16') && f.includes('drops a column')));
  assert.ok(!all.some((f) => f.includes('ALTER INDEX')));
});
