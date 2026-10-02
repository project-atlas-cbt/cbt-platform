/**
 * B20 (DoD 10, 11 — least privilege; 07 §42 invariants 14 and 15): the
 * single statement of what the runtime role `atlas_app` must NOT be able to
 * do, beyond what Postgres already denies a non-owner (DDL, DROP, TRUNCATE,
 * ALTER — `atlas_app` owns no table). `grantAppRole()` applies these after
 * its blanket DML grant on every deploy/reset; the privilege test
 * (`tests/tenancy/db-privileges.integration.test.ts`) asserts them against
 * the live catalog; the retention sweep (`apps/worker`) refuses to target
 * any table listed here.
 *
 * Every entry was checked against product code when B20 introduced it: no
 * product path issues the revoked statement (test fixtures that did now
 * use the owner connection — see `apps/api/src/test-support/owner-prisma.ts`).
 */

/** Academic evidence (invariant 14: "expired access does not destroy
 * academic history"; ADR-0028: "academic evidence — attempts, answers,
 * snapshots, results — is never destroyed"). Rows here may still be
 * UPDATEd where the domain allows (e.g. attempt state transitions, already
 * guarded by triggers), but never DELETEd by the application. */
export const ACADEMIC_EVIDENCE_TABLES = [
  'exam_attempts',
  'attempt_question_snapshots',
  'attempt_answers',
  'attempt_answer_events',
  'attempt_events',
  'attempt_question_results',
  'attempt_authorizations',
  'exam_participations',
  'results',
  'result_publications',
  'result_adjustment_operations',
  'result_adjustments',
  'question_reviews',
] as const;

/** Append-only (invariant 15 for audit; ADR-0007/0008 for answer events and
 * snapshots; B9/B15 for reviews and adjustments). Already trigger-protected
 * — the REVOKE is the second, independent layer, matching how B10 treated
 * `audit_events`. */
export const APPEND_ONLY_TABLES = [
  'audit_events',
  'attempt_answer_events',
  'attempt_question_snapshots',
  'question_reviews',
  'result_adjustments',
] as const;

/** Tables whose rows the application must never delete at all. */
export const NO_DELETE_TABLES = [
  ...ACADEMIC_EVIDENCE_TABLES,
  'audit_events',
  // A school is the tenant root; ~45 relations cascade from it, and
  // referential actions run with the table owner's rights, so a single
  // DELETE here would fan out past every other revoke in this file.
  'schools',
] as const;

/** Platform authority is provisioned by operators (seed / owner
 * connection), never by the running application — no product path creates
 * a Software Admin (B3). Revoking writes closes the "SQL injection → INSERT
 * a SOFTWARE_ADMIN assignment" escalation path entirely. */
export const NO_WRITE_TABLES = ['platform_role_assignments'] as const;

/** Prisma's migration ledger — the application has no business reading or
 * writing it. */
export const NO_ACCESS_TABLES = ['_prisma_migrations'] as const;

export type ProtectedTable =
  | (typeof NO_DELETE_TABLES)[number]
  | (typeof APPEND_ONLY_TABLES)[number]
  | (typeof NO_WRITE_TABLES)[number];

/** Every table the retention sweep must never target. */
export const RETENTION_PROTECTED_TABLES: ReadonlySet<string> = new Set<string>([
  ...NO_DELETE_TABLES,
  ...APPEND_ONLY_TABLES,
  ...NO_WRITE_TABLES,
  ...NO_ACCESS_TABLES,
]);

function quoteIdent(name: string): string {
  if (!/^[a-z_][a-z0-9_]*$/.test(name)) throw new Error(`Refusing to quote identifier "${name}".`);
  return `"${name}"`;
}

/** The REVOKE statements `grantAppRole()` runs after its blanket grant.
 * Each is wrapped so a database migrated only partway (a table not created
 * yet) doesn't abort the whole grant pass. */
export function appRoleRevokeStatements(role = 'atlas_app'): string[] {
  const wrap = (sql: string) => `
      DO $$
      BEGIN
        ${sql};
      EXCEPTION WHEN undefined_table THEN
        NULL;
      END $$;`;
  return [
    ...APPEND_ONLY_TABLES.map((t) =>
      wrap(`REVOKE UPDATE, DELETE ON ${quoteIdent(t)} FROM ${role}`),
    ),
    ...NO_DELETE_TABLES.map((t) => wrap(`REVOKE DELETE ON ${quoteIdent(t)} FROM ${role}`)),
    ...NO_WRITE_TABLES.map((t) =>
      wrap(`REVOKE INSERT, UPDATE, DELETE ON ${quoteIdent(t)} FROM ${role}`),
    ),
    ...NO_ACCESS_TABLES.map((t) => wrap(`REVOKE ALL ON ${quoteIdent(t)} FROM ${role}`)),
    // Belt and braces: TRUNCATE/REFERENCES/TRIGGER are never part of the
    // baseline grant, but an older database may have picked them up.
    `REVOKE TRUNCATE, REFERENCES, TRIGGER ON ALL TABLES IN SCHEMA public FROM ${role}`,
    `REVOKE CREATE ON SCHEMA public FROM ${role}`,
  ];
}
