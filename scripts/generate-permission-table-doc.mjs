#!/usr/bin/env node
/**
 * B2 DoD item 1: "the normalised permission table... must be reviewed and
 * approved before guards are written." packages/domain/src/authorization/
 * permission-table.ts is the single source of truth guards are actually
 * built from; this script renders it to a human-reviewable Markdown
 * document (docs/architecture/permission-table.md) rather than that
 * document being hand-maintained separately and risking drift — the same
 * "generated, not hand-duplicated" approach as apps/api's openapi.json.
 *
 * Run after `pnpm --filter @atlas/domain run build` (imports its dist
 * output, like every other consumer). Not currently wired into a CI
 * drift-check the way openapi.json is — a reasonable follow-up, not done
 * here to keep B2's scope to what the roadmap actually asks for.
 *
 * eslint.config.mjs's ad-hoc "default project" for root scripts/*.mjs
 * (used only by the lint-staged pre-commit hook — turbo's own `lint`
 * never touches this directory) can't resolve this relative dist import
 * against a real tsconfig `include`, so every value below types as `any`
 * and cascades into no-unsafe-* noise unrelated to this script's actual
 * correctness. lint-schema-tenancy.mjs avoids the problem entirely by
 * never importing a workspace package; this script's whole job is
 * rendering PERMISSION_TABLE, so that option isn't available here.
 */
/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-return */
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { PERMISSION_TABLE, ROLES } from '../packages/domain/dist/index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const outPath = resolve(__dirname, '../docs/architecture/permission-table.md');

function grantCell(grant) {
  switch (grant.kind) {
    case 'GRANTED':
      return `${grant.scope}${grant.note ? ` ⚠️` : ''}`;
    case 'DENIED':
      return '—';
    case 'BREAK_GLASS':
      return '🔒 BREAK-GLASS';
    case 'SYSTEM':
      return 'SYSTEM';
    case 'DEFERRED':
      return '⏸ DEFERRED';
    default:
      return '?';
  }
}

function noteFor(grant) {
  return grant.note ?? (grant.kind === 'DEFERRED' ? grant.note : undefined);
}

const lines = [];
lines.push('# Normalised Permission Table');
lines.push('');
lines.push(
  '**Generated from `packages/domain/src/authorization/permission-table.ts` — do not hand-edit this file.** ' +
    'Regenerate with `node scripts/generate-permission-table-doc.mjs` after `pnpm --filter @atlas/domain run build`.',
);
lines.push('');
lines.push(
  'This is B2\'s DoD item 1 deliverable: "the normalised permission table derived from `02`, resolving the ' +
    'undefined vocabulary in `A-03` into a closed set of scope predicates... reviewed and approved before guards ' +
    'are written." Every row below traces to one labelled row of `docs/02-roles-permissions.md`\'s matrix.',
);
lines.push('');
lines.push(
  '**Legend:** `PLATFORM`/`SCHOOL`/`DEPARTMENT`/`ASSIGNED`/`OWNED`/`SELF`/`NONE` are the seven closed scope ' +
    'predicates (A-03). `—` = denied. `🔒 BREAK-GLASS` = Software Admin only, via the audited break-glass path ' +
    '(ADR-0012) — never an ordinary grant. `SYSTEM` = automatic, no human role invokes it directly. ' +
    "`⏸ DEFERRED` = the matrix documents this capability but its mechanism (e.g. ADR-0017's request/approval " +
    'subsystem) is explicitly out of scope for now — denied, fail-closed, until that decision is acted on. ' +
    '`⚠️` marks a grant with an interpretive note (hover the row in the source file, or see the Notes column) — ' +
    'most commonly a "Limited" cell resolved to read-only pending the phase that builds the underlying resource.',
);
lines.push('');

const bySection = new Map();
for (const rule of PERMISSION_TABLE) {
  if (!bySection.has(rule.section)) bySection.set(rule.section, []);
  bySection.get(rule.section).push(rule);
}

for (const [section, rules] of bySection) {
  lines.push(`## ${section}`);
  lines.push('');
  lines.push(`| Action | ${ROLES.join(' | ')} | Awaiting |`);
  lines.push(`| --- | ${ROLES.map(() => '---').join(' | ')} | --- |`);
  for (const rule of rules) {
    const cells = ROLES.map((role) => grantCell(rule.grants[role]));
    lines.push(`| ${rule.label} | ${cells.join(' | ')} | ${rule.awaitingResource ?? ''} |`);
  }
  lines.push('');

  const notes = rules
    .flatMap((rule) => ROLES.map((role) => ({ rule, role, grant: rule.grants[role] })))
    .filter(({ grant }) => noteFor(grant));
  if (notes.length > 0) {
    lines.push('<details><summary>Notes</summary>');
    lines.push('');
    for (const { rule, role, grant } of notes) {
      lines.push(`- **${rule.label} / ${role}:** ${noteFor(grant)}`);
    }
    lines.push('');
    lines.push('</details>');
    lines.push('');
  }
}

writeFileSync(outPath, lines.join('\n'), 'utf-8');
console.log(
  `[generate-permission-table-doc] wrote ${outPath} — ${PERMISSION_TABLE.length} rows across ${bySection.size} sections.`,
);
