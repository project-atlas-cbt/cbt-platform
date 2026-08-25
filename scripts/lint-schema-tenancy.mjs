#!/usr/bin/env node
/**
 * B0 DB work: "Tenancy convention documented and enforced by a schema
 * lint: every school-owned table carries school_id as the leading indexed
 * column, with composite FKs to parents" (ADR-0023).
 *
 * A deliberately simple, dependency-free parser — good enough to catch the
 * mistake that matters (a new school-owned model landing without the
 * convention), not a general Prisma AST tool. If schema.prisma outgrows
 * what this can parse reliably, replace it with @prisma/internals'
 * getDMMF() rather than extending the regex further.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const schemaPath = resolve(__dirname, '../packages/db/prisma/schema.prisma');

// Models that are not school-owned — the tenant root itself, and anything
// explicitly platform-scoped. Extend deliberately, not by default.
//
// User (B1): deliberately tenant-independent — one physical person may hold
// SchoolMembership at more than one school (06 §7/§9), so it carries no
// school_id at all. See User's own doc comment in schema.prisma.
const EXEMPT_MODELS = new Set(['School', 'User']);

const schema = readFileSync(schemaPath, 'utf-8');
const modelBlockRe = /model\s+(\w+)\s*\{([^}]*)\}/g;

let violations = [];
let modelCount = 0;
let match;

while ((match = modelBlockRe.exec(schema))) {
  const [, name, body] = match;
  modelCount += 1;
  if (EXEMPT_MODELS.has(name)) continue;

  const hasSchoolIdField = /^\s*schoolId\s+String\b.*@map\("school_id"\)/m.test(body);
  if (!hasSchoolIdField) {
    violations.push(
      `${name}: missing a "schoolId String ... @map("school_id")" field (ADR-0023 denormalisation convention).`,
    );
    continue;
  }

  const indexLines = body.match(/@@(index|unique)\(\[([^\]]*)\]/g) ?? [];
  const hasLeadingSchoolIdIndex = indexLines.some((line) => {
    const inner = line.slice(line.indexOf('[') + 1, line.indexOf(']'));
    const firstField = inner.split(',')[0]?.trim();
    return firstField === 'schoolId';
  });

  if (!hasLeadingSchoolIdIndex) {
    violations.push(
      `${name}: has schoolId but no @@index([schoolId, ...]) or @@unique([schoolId, ...]) with schoolId leading (ADR-0023 "leading indexed column").`,
    );
  }
}

if (modelCount === 0) {
  console.error(
    `[lint-schema-tenancy] no models found in ${schemaPath} — parser or path is wrong.`,
  );
  process.exit(1);
}

if (violations.length > 0) {
  console.error('[lint-schema-tenancy] tenancy convention violations:\n');
  for (const v of violations) console.error(`  - ${v}`);
  console.error(`\n${violations.length} violation(s) across ${modelCount} model(s).`);
  process.exit(1);
}

console.log(`[lint-schema-tenancy] OK — ${modelCount} model(s) checked, tenancy convention holds.`);
