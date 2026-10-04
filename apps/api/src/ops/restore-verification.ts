import { withTenant, type PrismaClient } from '@atlas/db';

/**
 * B22 (DoD 10; 08 §21): post-restore data-integrity checks. Run against a
 * restored copy before it is trusted — by the PITR drill
 * (infra/dr/pitr-drill.sh) and by the restore runbook.
 *
 * Global checks read the catalogue; per-school checks run under each
 * school's tenant (RLS), so they work for an owner that does not bypass
 * RLS (RDS) as well as a local superuser. Every check is a count of rows
 * that break an invariant the application relies on:
 *
 * - every accepted answer row has its accepted event (ADR-0007: one
 *   transaction writes both, so a restore that splits them is torn);
 * - every finalised attempt has a result row (written in the same
 *   transaction as the transition);
 * - every FINAL result has every question marked and a total equal to the
 *   sum of its question marks (marking writes all of it in one transaction);
 * - row-level security is on and forced on every school-owned table, and
 *   the application role cannot bypass it;
 * - no migration is half-applied.
 *
 * Warnings are states a running system resolves by itself after a restore
 * (marking still owed — the worker's reconciliation pass re-enqueues it)
 * or that older data legitimately lacks, and are reported, not failed.
 */
export interface RestoreCheck {
  name: string;
  severity: 'error' | 'warning';
  count: number;
  detail?: string;
}

export interface RestoreVerification {
  ok: boolean;
  schools: number;
  checks: RestoreCheck[];
}

const n = (rows: { n: bigint | number }[]) => Number(rows[0]?.n ?? 0);

export async function verifyRestoredDatabase(
  db: PrismaClient,
  opts: { schoolIds?: string[]; expectedMigrations?: number } = {},
): Promise<RestoreVerification> {
  const checks: RestoreCheck[] = [];

  const [migrations] = await db.$queryRaw<{ applied: bigint; broken: bigint }[]>`
    SELECT count(*) FILTER (WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL) AS applied,
           count(*) FILTER (WHERE finished_at IS NULL OR rolled_back_at IS NOT NULL) AS broken
      FROM _prisma_migrations`;
  const applied = Number(migrations?.applied ?? 0);
  const missing =
    opts.expectedMigrations !== undefined ? Math.max(0, opts.expectedMigrations - applied) : 0;
  checks.push({
    name: 'migrations half-applied or missing',
    severity: 'error',
    count: Number(migrations?.broken ?? 0) + missing,
    detail: `${applied} applied${opts.expectedMigrations !== undefined ? ` of ${opts.expectedMigrations}` : ''}`,
  });

  checks.push({
    name: 'school-owned tables without forced row-level security',
    severity: 'error',
    count: n(
      await db.$queryRaw<{ n: bigint }[]>`
        SELECT count(DISTINCT c.oid) AS n
          FROM pg_class c
          JOIN pg_namespace ns ON ns.oid = c.relnamespace AND ns.nspname = 'public'
          JOIN pg_attribute a ON a.attrelid = c.oid AND a.attname = 'school_id' AND NOT a.attisdropped
         WHERE c.relkind = 'r' AND NOT (c.relrowsecurity AND c.relforcerowsecurity)`,
    ),
  });

  checks.push({
    name: 'application role missing or able to bypass row-level security',
    severity: 'error',
    count:
      1 -
      n(
        await db.$queryRaw<{ n: bigint }[]>`
          SELECT count(*) AS n FROM pg_roles
           WHERE rolname = 'atlas_app' AND NOT rolsuper AND NOT rolbypassrls`,
      ),
  });

  const schoolIds =
    opts.schoolIds ??
    (await db.$queryRaw<{ id: string }[]>`SELECT id::text FROM schools`).map((s) => s.id);

  const totals = {
    answersWithoutEvent: 0,
    finalisedWithoutResult: 0,
    finalIncomplete: 0,
    finalTotalWrong: 0,
    owedMarking: 0,
    finalisedWithoutAudit: 0,
  };
  for (const schoolId of schoolIds) {
    await withTenant(db, schoolId, async (tx) => {
      totals.answersWithoutEvent += n(
        await tx.$queryRaw<{ n: bigint }[]>`
          SELECT count(*) AS n FROM attempt_answers aa
           WHERE aa.school_id = ${schoolId}::uuid
             AND NOT EXISTS (
               SELECT 1 FROM attempt_answer_events e
                WHERE e.school_id = aa.school_id AND e.attempt_id = aa.attempt_id
                  AND e.exam_question_id = aa.exam_question_id
                  AND e.sequence_number = aa.sequence_number AND e.accepted)`,
      );
      totals.finalisedWithoutResult += n(
        await tx.$queryRaw<{ n: bigint }[]>`
          SELECT count(*) AS n FROM exam_attempts a
           WHERE a.school_id = ${schoolId}::uuid
             AND a.state::text IN ('SUBMITTED', 'AUTO_SUBMITTED')
             AND NOT EXISTS (SELECT 1 FROM results r WHERE r.school_id = a.school_id AND r.attempt_id = a.id)`,
      );
      const [final] = await tx.$queryRaw<{ incomplete: bigint; wrong: bigint }[]>`
        WITH q AS (
          SELECT exam_id, count(*) AS n FROM exam_questions
           WHERE school_id = ${schoolId}::uuid GROUP BY exam_id),
        m AS (
          SELECT attempt_id, count(*) AS n, sum(awarded_marks) AS earned
            FROM attempt_question_results WHERE school_id = ${schoolId}::uuid GROUP BY attempt_id)
        SELECT
          count(*) FILTER (WHERE coalesce(m.n, 0) <> coalesce(q.n, 0)) AS incomplete,
          count(*) FILTER (WHERE m.n IS NOT NULL AND r.earned_marks <> m.earned) AS wrong
          FROM results r
          LEFT JOIN q ON q.exam_id = r.exam_id
          LEFT JOIN m ON m.attempt_id = r.attempt_id
         WHERE r.school_id = ${schoolId}::uuid AND r.state::text = 'FINAL'`;
      totals.finalIncomplete += Number(final?.incomplete ?? 0);
      totals.finalTotalWrong += Number(final?.wrong ?? 0);
      totals.owedMarking += n(
        await tx.$queryRaw<{ n: bigint }[]>`
          SELECT count(*) AS n FROM results
           WHERE school_id = ${schoolId}::uuid AND state::text = 'PROCESSING'`,
      );
      totals.finalisedWithoutAudit += n(
        await tx.$queryRaw<{ n: bigint }[]>`
          SELECT count(*) AS n FROM exam_attempts a
           WHERE a.school_id = ${schoolId}::uuid
             AND a.state::text IN ('SUBMITTED', 'AUTO_SUBMITTED')
             AND NOT EXISTS (
               SELECT 1 FROM audit_events e
                WHERE e.entity_id = a.id
                  AND e.action IN ('ATTEMPT_SUBMITTED', 'ATTEMPT_AUTO_SUBMITTED'))`,
      );
    });
  }

  checks.push(
    {
      name: 'answer rows without their accepted event',
      severity: 'error',
      count: totals.answersWithoutEvent,
    },
    {
      name: 'finalised attempts without a result',
      severity: 'error',
      count: totals.finalisedWithoutResult,
    },
    {
      name: 'FINAL results with a question unmarked',
      severity: 'error',
      count: totals.finalIncomplete,
    },
    {
      name: 'FINAL results whose total is not the sum of question marks',
      severity: 'error',
      count: totals.finalTotalWrong,
    },
    {
      name: 'results still PROCESSING (marking owed; the worker reconciles it)',
      severity: 'warning',
      count: totals.owedMarking,
    },
    {
      name: 'finalised attempts without a finalisation audit (expected only before B22)',
      severity: 'warning',
      count: totals.finalisedWithoutAudit,
    },
  );

  return {
    ok: checks.every((c) => c.severity !== 'error' || c.count === 0),
    schools: schoolIds.length,
    checks,
  };
}
