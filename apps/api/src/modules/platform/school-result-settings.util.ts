import { prisma, withTenant } from '@atlas/db';
import type { SchoolResultSettings } from '@atlas/domain';

/** The school's result defaults and lock — the input to `@atlas/domain`'s
 * `effectiveResultSettings` (ADR-0010, 2026-10-06 amendment). Shared by the
 * exam, publication and student-result services so each reads the lock
 * the same way. */
export async function loadSchoolResultSettings(schoolId: string): Promise<SchoolResultSettings> {
  return withTenant(prisma, schoolId, (tx) =>
    tx.school.findUniqueOrThrow({
      where: { id: schoolId },
      select: { resultPolicy: true, resultDetailVisibility: true, resultPolicyLocked: true },
    }),
  );
}
