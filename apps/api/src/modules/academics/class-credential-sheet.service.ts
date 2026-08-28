import { Injectable } from '@nestjs/common';
import { prisma, withTenant } from '@atlas/db';
import type { Role } from '@atlas/domain';
import { AppHttpException } from '../../common/app-http-exception.js';
import { AuditService } from '../operations/audit-event.service.js';
import { CredentialSheetService } from '../identity/credential-sheet.service.js';
import { StudentEnrollmentService } from './student-enrollment.service.js';

interface ActorContext {
  actorUserId: string;
  actorRole: Role;
}

/**
 * F7 gap-closure 2 (`docs/roadmaps/frontend-roadmap.md`'s F7 DoD item 8 — "a
 * class credential sheet downloads"). No endpoint bulk-issued credentials
 * for a whole class before this — only the per-student
 * `POST /students/:id/reset-credentials` existed (`StudentService
 * .resetCredentials`), itself already calling
 * `CredentialSheetService.issueInitialPasswords`.
 *
 * Confirmed with the project owner: regenerates credentials for every
 * ACTIVE student currently in the class roster, unconditionally — no
 * "skip already-activated" filter. This is a real disruption risk against
 * production data (an already-active student's password would be silently
 * invalidated), explicitly accepted for now since this is a development-
 * phase capability with no real student data yet. A future phase that
 * revisits this after real usage begins should reconsider this semantic,
 * not silently keep it by default.
 */
@Injectable()
export class ClassCredentialSheetService {
  constructor(
    private readonly enrollments: StudentEnrollmentService,
    private readonly credentialSheets: CredentialSheetService,
    private readonly audit: AuditService,
  ) {}

  /** Returns the rendered CSV body directly — the controller sends it as a
   * raw `text/csv` attachment rather than a JSON envelope (see
   * `class-credential-sheet.controller.ts`'s own doc comment for why). */
  async issueForClass(schoolId: string, classId: string, actor: ActorContext): Promise<string> {
    const classGroup = await withTenant(prisma, schoolId, (tx) =>
      tx.classGroup.findUnique({ where: { id: classId } }),
    );
    if (!classGroup) {
      throw new AppHttpException({ code: 'NOT_FOUND', message: 'Class not found.' });
    }

    const roster = await this.enrollments.rosterForClass(schoolId, classId);
    if (roster.length === 0) {
      // Skip gracefully — a class with no active enrollment isn't an error,
      // just an empty (header-only) sheet.
      return this.credentialSheets.toCsv([]);
    }

    const rosterProfileIds = roster.map((entry) => entry.studentProfileId);
    const profiles = await withTenant(prisma, schoolId, (tx) =>
      tx.studentProfile.findMany({
        where: { id: { in: rosterProfileIds } },
        select: { id: true, membershipId: true },
      }),
    );
    const membershipIds = profiles.map((profile) => profile.membershipId);

    const rows = await this.credentialSheets.issueInitialPasswords(schoolId, membershipIds);

    // One audit event for the class-level action, not one per student —
    // matches this codebase's existing "audit at the action's own
    // granularity" precedent (PUT /teachers/:id/assignments's full-replace
    // gets one event, not one per classSubjectId). The roster at the time
    // is reconstructable from StudentEnrollment history if ever needed.
    await this.audit.record({
      schoolId,
      actorUserId: actor.actorUserId,
      actorRole: actor.actorRole,
      action: 'CLASS_CREDENTIAL_SHEET_ISSUED',
      entityType: 'ClassGroup',
      entityId: classId,
    });

    return this.credentialSheets.toCsv(rows);
  }
}
