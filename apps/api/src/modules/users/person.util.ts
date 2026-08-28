import type { Prisma } from '@atlas/db';
import type { Role } from '@atlas/domain';
import { AppHttpException } from '../../common/app-http-exception.js';
import { runUniqueGuarded } from '../academics/prisma-error.util.js';

export interface CreatePersonInput {
  schoolId: string;
  firstName: string;
  lastName: string;
  /** ADR-0019: staff need an address to send invitations/resets to;
   * students never have one by design. */
  email?: string;
  /** Per-school-unique login identifier (ADR-0005) — a student's own
   * `studentId` or a teacher's own `staffId` for those roles; an explicit
   * value for Moderator, which has no profile of its own to derive one
   * from. */
  loginIdentifier: string;
  role: Role;
}

export interface CreatedPerson {
  userId: string;
  membershipId: string;
}

/**
 * Shared by every one of UsersModule's four create flows (student, teacher,
 * HOD-promotion path excepted — HODs are promoted from an existing
 * membership, not created via this helper, per the confirmed
 * promote-existing-teacher model — moderator): one User + SchoolMembership +
 * RoleAssignment, inside the caller's own transaction. One helper instead of
 * four near-duplicates, mirroring `actor.util.ts`'s existing "small shared
 * util per module" convention.
 *
 * `User.status` starts `INVITED` (07 §5.1) — DoD item 1's "created" state.
 * `credentialState` defaults to `MUST_SET_PASSWORD` (the Prisma column
 * default) — staff set their own via the invitation link
 * (`IdentityService.issueStaffInvitation`); a student's is set by
 * `CredentialSheetService.issueInitialPasswords` instead, which also flips
 * it to `MUST_CHANGE_PASSWORD`.
 */
export async function createPersonMembership(
  tx: Prisma.TransactionClient,
  input: CreatePersonInput,
): Promise<CreatedPerson> {
  const user = await tx.user.create({
    data: {
      firstName: input.firstName,
      lastName: input.lastName,
      displayName: `${input.firstName} ${input.lastName}`,
      status: 'INVITED',
      ...(input.email !== undefined && { email: input.email }),
    },
  });

  const membership = await runUniqueGuarded(
    () =>
      tx.schoolMembership.create({
        data: {
          schoolId: input.schoolId,
          userId: user.id,
          loginIdentifier: input.loginIdentifier,
          status: 'ACTIVE',
        },
      }),
    `The login identifier "${input.loginIdentifier}" is already in use at this school.`,
  );

  await tx.roleAssignment.create({
    data: { schoolId: input.schoolId, membershipId: membership.id, role: input.role },
  });

  return { userId: user.id, membershipId: membership.id };
}

/** `NOT_FOUND` helper shared by every entity service's get/update/lifecycle
 * methods — mirrors `AppHttpException({code:'NOT_FOUND', ...})`'s existing
 * per-file inline usage in the academics module, centralised here since
 * every UsersModule service needs the identical "membership + role" shape
 * of lookup. */
export function notFound(entityLabel: string): never {
  throw new AppHttpException({ code: 'NOT_FOUND', message: `${entityLabel} not found.` });
}
