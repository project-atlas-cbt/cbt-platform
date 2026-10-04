#!/usr/bin/env node
/**
 * B23 DoD 4 (08 §22): migrations are backward-aware. During a rollout the
 * previous API/worker version runs against the new schema until every task
 * is replaced, and a rollback runs the previous version against it
 * indefinitely. So a migration may only *expand* the schema; a step that
 * removes or reshapes something the previous version still reads or writes
 * is a *contract* step, shipped in a later release once nothing depends on
 * it (docs/operations/migrations.md).
 *
 * This flags contract-shaped DDL in every migration newer than BASELINE
 * (earlier migrations shipped before any production deployment existed).
 * A migration that is deliberately a contract step says so on its own
 * line, with a reason a reviewer can check:
 *
 *   -- atlas:contract <why the previous release no longer depends on this>
 *
 * Deliberately a line-level regex check, like lint-schema-tenancy.mjs: it
 * catches the common mistakes, it does not parse SQL.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const BASELINE = '20261004120000';

/** [pattern, why it breaks the previous release] */
export const RULES = [
  [/\bDROP\s+TABLE\b/i, 'drops a table the previous release may still query'],
  [/\bDROP\s+COLUMN\b/i, 'drops a column the previous release may still select or insert'],
  // Index renames are invisible to the application, so ALTER INDEX is exempt.
  [
    /^(?!ALTER\s+INDEX\b).*\bRENAME\s+(COLUMN|TO)\b/i,
    'renames something the previous release refers to by name',
  ],
  [
    /\bALTER\s+COLUMN\s+"?\w+"?\s+(SET\s+DATA\s+)?TYPE\b/i,
    'changes a column type under the previous release',
  ],
  [
    /\bALTER\s+COLUMN\s+"?\w+"?\s+SET\s+NOT\s+NULL\b/i,
    'makes a column required that the previous release may not write',
  ],
  [/\bDROP\s+TYPE\b/i, 'drops an enum/type the previous release may use'],
  [
    /\bALTER\s+TYPE\b.*\b(RENAME|DROP)\b/i,
    'renames or removes an enum value the previous release may write',
  ],
  [
    /\bDROP\s+(FUNCTION|VIEW|MATERIALIZED\s+VIEW)\b/i,
    'drops an object the previous release may call',
  ],
  [/\bTRUNCATE\b/i, 'deletes data'],
  [/^\s*DELETE\s+FROM\b/i, 'deletes data'],
];

/** ADD COLUMN … NOT NULL without a DEFAULT: the previous release's inserts omit it and fail. */
const ADD_REQUIRED = /\bADD\s+COLUMN\s+(IF\s+NOT\s+EXISTS\s+)?"?\w+"?\s+[^,;]*\bNOT\s+NULL\b/i;
const HAS_DEFAULT = /\bDEFAULT\b/i;
const CONTRACT_MARKER = /^[ \t]*--[ \t]*atlas:contract[ \t]+\S.{9,}/m;

export function checkMigration(name, sql) {
  if (CONTRACT_MARKER.test(sql)) return [];
  const findings = [];
  // Comments never count; statements may span lines, so check per statement too.
  const code = sql.replace(/--.*$/gm, '');
  code.split(';').forEach((statement) => {
    const flat = statement.replace(/\s+/g, ' ').trim();
    if (!flat) return;
    for (const [pattern, why] of RULES) {
      if (pattern.test(flat)) findings.push(`${name}: ${why}: ${flat.slice(0, 120)}`);
    }
    if (ADD_REQUIRED.test(flat) && !HAS_DEFAULT.test(flat)) {
      findings.push(
        `${name}: adds a NOT NULL column without a DEFAULT, so the previous release's inserts fail: ${flat.slice(0, 120)}`,
      );
    }
  });
  return findings;
}

export function checkDirectory(dir, baseline = BASELINE) {
  return readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && d.name.slice(0, 14) > baseline)
    .flatMap((d) =>
      checkMigration(d.name, readFileSync(join(dir, d.name, 'migration.sql'), 'utf8')),
    );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const dir = resolve(dirname(fileURLToPath(import.meta.url)), '../packages/db/prisma/migrations');
  const findings = checkDirectory(dir);
  if (findings.length > 0) {
    console.error('Migration lint (B23): contract-shaped DDL in an expand migration.\n');
    for (const f of findings) console.error(`  - ${f}`);
    console.error(
      '\nSplit it: ship the expand step now and the contract step in a later release,\n' +
        'or mark a deliberate contract migration with "-- atlas:contract <reason>".\n' +
        'See docs/operations/migrations.md.',
    );
    process.exit(1);
  }
  console.log(`Migration lint: migrations after ${BASELINE} are expand-only.`);
}
