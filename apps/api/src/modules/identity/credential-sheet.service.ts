import { Injectable } from '@nestjs/common';
import { prisma, withTenant } from '@atlas/db';
import { AuthLockoutService } from './auth-lockout.service.js';
import { PasswordService } from './password.service.js';
import { SessionService } from './session.service.js';

export interface CredentialSheetRow {
  studentId: string;
  displayName: string;
  loginIdentifier: string;
  initialPassword: string;
}

/**
 * ADR-0019/A-02's "one-time credential sheet" primitive — scoped to exactly
 * what B1 can build today. `ClassGroup` (B5) and the bulk import pipeline
 * (B7) don't exist yet, so there is no "generate a sheet for this class"
 * endpoint here and no controller route: this service takes an explicit
 * list of student membership ids (however the caller obtained them — B1's
 * own tests seed them directly) and does two things no later phase should
 * reimplement:
 *
 *   1. Generates each student's system-generated initial password and
 *      stores only its hash (MUST_CHANGE_PASSWORD) — the plaintext exists
 *      only in the value this method returns, never again after that.
 *   2. Renders the CSV a Moderator would download.
 *
 * B6/B7 call `issueInitialPasswords` at the point a class's students are
 * actually created (wrapping it with real ClassGroup grouping), then
 * `toCsv` on the result — not reimplement either half.
 */
@Injectable()
export class CredentialSheetService {
  constructor(
    private readonly passwords: PasswordService,
    private readonly sessions: SessionService,
    private readonly lockout: AuthLockoutService,
  ) {}

  /**
   * Generates and stores a fresh initial password for each given student
   * membership, returning the one and only moment the plaintext exists.
   */
  async issueInitialPasswords(
    schoolId: string,
    studentMembershipIds: string[],
  ): Promise<CredentialSheetRow[]> {
    const memberships = await withTenant(prisma, schoolId, (tx) =>
      tx.schoolMembership.findMany({
        where: { schoolId, id: { in: studentMembershipIds } },
        include: { studentProfile: true },
      }),
    );

    const rows: CredentialSheetRow[] = [];
    for (const membership of memberships) {
      if (!membership.studentProfile) continue; // not a student membership — skip rather than error
      const initialPassword = this.passwords.generateInitialPassword();
      const passwordHash = await this.passwords.hash(initialPassword);

      // Gap closure (2026-08-30): a student created by createPersonMembership
      // starts `status: 'INVITED'`, and — unlike staff, who "accept" via
      // confirmPasswordReset — a student has no separate acceptance step at
      // all: this is the one and only moment their account becomes usable.
      // Read-before-write so a repeat credential-sheet issuance (e.g. F7's
      // per-class regenerate, or a lone student's reset-credentials call)
      // never overwrites a SUSPENDED/INACTIVE account back to ACTIVE — only
      // INVITED specifically means "never claimed yet." Mirrors
      // IdentityService.confirmPasswordReset's identical guard for staff.
      const existingUser = await prisma.user.findUniqueOrThrow({
        where: { id: membership.userId },
      });
      const user = await prisma.user.update({
        where: { id: membership.userId },
        data: {
          passwordHash,
          credentialState: 'MUST_CHANGE_PASSWORD',
          ...(existingUser.status === 'INVITED' ? { status: 'ACTIVE' as const } : {}),
        },
      });
      // B20: re-issuing credentials is an administrator-forced reset — any
      // session the student (or whoever had their old password) holds ends.
      // A never-claimed (INVITED) account has never signed in, so there is
      // nothing to revoke — skipping it keeps bulk imports to one write per
      // student.
      if (existingUser.status !== 'INVITED') {
        await this.sessions.revokeAllForUser(schoolId, membership.userId);
      }
      // P1-4: fresh credentials end any sign-in lockout, so a student
      // locked out mid-exam can sign straight back in with them.
      await this.lockout.clear(schoolId, membership.loginIdentifier);
      rows.push({
        studentId: membership.studentProfile.studentId,
        displayName: user.displayName,
        loginIdentifier: membership.loginIdentifier,
        initialPassword,
      });
    }
    return rows;
  }

  /** RFC 4180-ish CSV — quotes every field, escapes embedded quotes, and
   * prefixes any value starting with =, +, -, or @ with a leading tab to
   * defuse spreadsheet formula injection (the same class of concern the
   * B18 export phase's own Testing requirements name explicitly). */
  toCsv(rows: CredentialSheetRow[]): string {
    const header = ['Student ID', 'Name', 'Login Identifier', 'Initial Password'];
    const escape = (value: string): string => {
      const guarded = /^[=+\-@]/.test(value) ? `\t${value}` : value;
      return `"${guarded.replace(/"/g, '""')}"`;
    };
    const lines = [
      header,
      ...rows.map((r) => [r.studentId, r.displayName, r.loginIdentifier, r.initialPassword]),
    ];
    return lines.map((line) => line.map(escape).join(',')).join('\r\n') + '\r\n';
  }
}
