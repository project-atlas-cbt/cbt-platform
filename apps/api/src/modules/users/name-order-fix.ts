import { prisma, withTenant, type Prisma } from '@atlas/db';
import type { AuditService } from '../operations/audit-event.service.js';
import { personNameData } from './person.util.js';

/**
 * One-off repair (owner decision 2026-10-09) for students imported before
 * the template had a Surname column in register order. The pilot school's
 * roster listed names as "Surname First Middle", so its upload put the
 * surname in First Name and "First Middle" in Last Name:
 *
 *   before: firstName "Ojo",    lastName "Abiola Bola", middleName null
 *   after:  firstName "Abiola", lastName "Ojo",         middleName "Bola"
 *
 * The rule is deterministic and invertible, so the audit entry records only
 * that a student's name was reordered (no names), and `revert` rebuilds the
 * old values from the current ones. A student is reordered at most once:
 * the audit trail, not the data, says whether it already happened.
 */
export const NAME_ORDER_FIXED_ACTION = 'STUDENT_NAME_ORDER_FIXED';
export const NAME_ORDER_REVERTED_ACTION = 'STUDENT_NAME_ORDER_REVERTED';

export type NameOrderNote =
  | 'OK'
  | 'ALREADY_FIXED'
  | 'HAS_MIDDLE_NAME'
  | 'EMPTY_NAME'
  | 'SURNAME_HAS_SEVERAL_WORDS'
  | 'MORE_THAN_TWO_NAMES'
  | 'SKIPPED_BY_OPERATOR';

export interface NameOrderProposal {
  studentProfileId: string;
  userId: string;
  studentId: string;
  current: { firstName: string; middleName: string | null; lastName: string };
  /** Present only when `note` is OK: the values the fix writes. */
  proposed: { firstName: string; middleName: string | null; lastName: string } | null;
  note: NameOrderNote;
}

function words(value: string): string[] {
  return value.trim().split(/\s+/).filter(Boolean);
}

/** The rule for one student; anything that doesn't fit is flagged, never
 * guessed at, and left for the school to fix on the edit form. */
export function proposeNameOrder(current: {
  firstName: string;
  middleName: string | null;
  lastName: string;
}): Pick<NameOrderProposal, 'proposed' | 'note'> {
  if (current.middleName) return { proposed: null, note: 'HAS_MIDDLE_NAME' };
  const surname = words(current.firstName);
  const given = words(current.lastName);
  if (surname.length === 0 || given.length === 0) return { proposed: null, note: 'EMPTY_NAME' };
  if (surname.length > 1) return { proposed: null, note: 'SURNAME_HAS_SEVERAL_WORDS' };
  if (given.length > 2) return { proposed: null, note: 'MORE_THAN_TWO_NAMES' };
  return {
    proposed: { lastName: surname[0]!, firstName: given[0]!, middleName: given[1] ?? null },
    note: 'OK',
  };
}

/** Students whose last audit entry for this repair is a fix, not a revert. */
async function currentlyFixed(
  tx: Prisma.TransactionClient,
  schoolId: string,
): Promise<Set<string>> {
  const events = await tx.auditEvent.findMany({
    where: {
      schoolId,
      action: { in: [NAME_ORDER_FIXED_ACTION, NAME_ORDER_REVERTED_ACTION] },
      entityType: 'StudentProfile',
    },
    select: { entityId: true, action: true },
    orderBy: [{ occurredAt: 'asc' }, { id: 'asc' }],
  });
  const fixed = new Set<string>();
  for (const event of events) {
    if (!event.entityId) continue;
    if (event.action === NAME_ORDER_FIXED_ACTION) fixed.add(event.entityId);
    else fixed.delete(event.entityId);
  }
  return fixed;
}

async function loadStudents(tx: Prisma.TransactionClient, schoolId: string) {
  const rows = await tx.studentProfile.findMany({
    where: { schoolId },
    select: {
      id: true,
      studentId: true,
      membership: {
        select: {
          userId: true,
          user: { select: { firstName: true, middleName: true, lastName: true } },
        },
      },
    },
  });
  return rows.sort((a, b) => a.studentId.localeCompare(b.studentId, 'en', { numeric: true }));
}

/** The review list: every student of the school with what the fix would do. */
export async function planNameOrderFix(
  schoolId: string,
  skipStudentIds: ReadonlySet<string> = new Set(),
): Promise<NameOrderProposal[]> {
  return withTenant(prisma, schoolId, async (tx) => {
    const fixed = await currentlyFixed(tx, schoolId);
    const skip = new Set([...skipStudentIds].map((id) => id.toLowerCase()));
    return (await loadStudents(tx, schoolId)).map((row) => {
      const current = row.membership.user;
      const base = {
        studentProfileId: row.id,
        userId: row.membership.userId,
        studentId: row.studentId,
        current,
      };
      if (fixed.has(row.id)) return { ...base, proposed: null, note: 'ALREADY_FIXED' as const };
      if (skip.has(row.studentId.toLowerCase()))
        return { ...base, proposed: null, note: 'SKIPPED_BY_OPERATOR' as const };
      return { ...base, ...proposeNameOrder(current) };
    });
  });
}

/** Writes every OK proposal, each with its audit entry, in one transaction:
 * either the whole school is reordered or nobody is. */
export async function applyNameOrderFix(
  audit: AuditService,
  params: { schoolId: string; actorUserId: string; skipStudentIds?: ReadonlySet<string> },
): Promise<NameOrderProposal[]> {
  const { schoolId, actorUserId } = params;
  return withTenant(prisma, schoolId, async (tx) => {
    const fixed = await currentlyFixed(tx, schoolId);
    const skip = new Set([...(params.skipStudentIds ?? [])].map((id) => id.toLowerCase()));
    const applied: NameOrderProposal[] = [];
    for (const row of await loadStudents(tx, schoolId)) {
      if (fixed.has(row.id) || skip.has(row.studentId.toLowerCase())) continue;
      const { proposed, note } = proposeNameOrder(row.membership.user);
      if (!proposed) continue;
      await tx.user.update({
        where: { id: row.membership.userId },
        data: personNameData(proposed),
      });
      await audit.recordInTx(tx, {
        schoolId,
        actorUserId,
        actorRole: 'SOFTWARE_ADMIN',
        action: NAME_ORDER_FIXED_ACTION,
        entityType: 'StudentProfile',
        entityId: row.id,
        reason: 'Names imported in register order; surname moved to Surname (2026-10-09).',
        metadata: { rule: 'surname<-first; first,middle<-last' },
      });
      applied.push({
        studentProfileId: row.id,
        userId: row.membership.userId,
        studentId: row.studentId,
        current: row.membership.user,
        proposed,
        note,
      });
    }
    return applied;
  });
}

/** Undoes the fix for every student it reordered, rebuilding the old values
 * from the current ones (old First Name = Surname; old Last Name = First
 * Middle). */
export async function revertNameOrderFix(
  audit: AuditService,
  params: { schoolId: string; actorUserId: string },
): Promise<string[]> {
  const { schoolId, actorUserId } = params;
  return withTenant(prisma, schoolId, async (tx) => {
    const fixed = await currentlyFixed(tx, schoolId);
    const reverted: string[] = [];
    for (const row of await loadStudents(tx, schoolId)) {
      if (!fixed.has(row.id)) continue;
      const { firstName, middleName, lastName } = row.membership.user;
      await tx.user.update({
        where: { id: row.membership.userId },
        data: personNameData({
          firstName: lastName,
          middleName: null,
          lastName: [firstName, middleName].filter(Boolean).join(' '),
        }),
      });
      await audit.recordInTx(tx, {
        schoolId,
        actorUserId,
        actorRole: 'SOFTWARE_ADMIN',
        action: NAME_ORDER_REVERTED_ACTION,
        entityType: 'StudentProfile',
        entityId: row.id,
        reason: 'Name order fix undone by the operator.',
      });
      reverted.push(row.studentId);
    }
    return reverted;
  });
}
