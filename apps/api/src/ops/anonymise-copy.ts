import { withTenant, type PrismaClient } from '@atlas/db';

/**
 * B22 (08 §22: "restored non-production environments must not contain live
 * personal data unless anonymised"): replaces every personal identifier in
 * a RESTORED COPY of the database. Never run against production — the CLI
 * (anonymise-copy-cli.ts) refuses a URL that matches this environment's
 * own database, and demands the copy's database name typed back.
 *
 * What it changes is the data inventory's Identity (PII) row
 * (docs/compliance/data-protection.md §2) plus everything else that names
 * or locates a person: names, emails, credentials and MFA secrets, sign-in
 * identifiers, student/staff/admission numbers, admission dates, raw import
 * cells, notification text, IP addresses and user agents, school contact
 * details, uploaded file names, audit reasons (free text), and every
 * session and reset token.
 *
 * What it keeps: every id and every academic row — attempts, answers,
 * snapshots, results — so the copy still behaves like the system it came
 * from (the point of a restore drill or a staging copy). Questions are
 * school content, not personal data, and stay.
 */
export interface AnonymiseSummary {
  users: number;
  memberships: number;
  studentProfiles: number;
  teacherProfiles: number;
  importRows: number;
  notifications: number;
  attempts: number;
  sessionsDeleted: number;
  schools: number;
}

export const ANONYMISED_IMPORT_ROW = { redacted: true, by: 'anonymise-copy' } as const;

export async function anonymiseCopy(db: PrismaClient): Promise<AnonymiseSummary> {
  const summary: AnonymiseSummary = {
    users: 0,
    memberships: 0,
    studentProfiles: 0,
    teacherProfiles: 0,
    importRows: 0,
    notifications: 0,
    attempts: 0,
    sessionsDeleted: 0,
    schools: 0,
  };

  // Not school-owned: users and platform-level credentials.
  summary.users = await db.$executeRaw`
    UPDATE users SET
      first_name = 'Person',
      middle_name = NULL,
      last_name = substr(replace(id::text, '-', ''), 1, 8),
      display_name = 'Person ' || substr(replace(id::text, '-', ''), 1, 8),
      email = CASE WHEN email IS NULL THEN NULL
                   ELSE 'user-' || substr(replace(id::text, '-', ''), 1, 12) || '@example.invalid' END,
      password_hash = NULL`;
  await db.$executeRaw`DELETE FROM platform_sessions`;
  await db.$executeRaw`DELETE FROM platform_mfa_recovery_codes`;
  await db.$executeRaw`DELETE FROM platform_mfa_credentials`;

  const schools = await db.$queryRaw<{ id: string }[]>`SELECT id::text FROM schools`;
  for (const { id: schoolId } of schools) {
    await withTenant(db, schoolId, async (tx) => {
      summary.memberships += await tx.$executeRaw`
        UPDATE school_memberships SET login_identifier = 'user-' || substr(replace(id::text, '-', ''), 1, 12)
         WHERE school_id = ${schoolId}::uuid`;
      summary.studentProfiles += await tx.$executeRaw`
        UPDATE student_profiles SET
          student_id = 'S-' || substr(replace(id::text, '-', ''), 1, 12),
          admission_number = NULL,
          admission_date = NULL
         WHERE school_id = ${schoolId}::uuid`;
      summary.teacherProfiles += await tx.$executeRaw`
        UPDATE teacher_profiles SET staff_id = 'T-' || substr(replace(id::text, '-', ''), 1, 12)
         WHERE school_id = ${schoolId}::uuid`;
      summary.importRows += await tx.$executeRaw`
        UPDATE import_rows SET raw_data = ${JSON.stringify(ANONYMISED_IMPORT_ROW)}::jsonb
         WHERE school_id = ${schoolId}::uuid`;
      summary.notifications += await tx.$executeRaw`
        UPDATE notifications SET title = 'Notification', content = 'Content removed in an anonymised copy.'
         WHERE school_id = ${schoolId}::uuid`;
      summary.attempts += await tx.$executeRaw`
        UPDATE exam_attempts SET start_ip_address = NULL, start_user_agent = NULL
         WHERE school_id = ${schoolId}::uuid`;
      await tx.$executeRaw`
        UPDATE media_assets SET original_filename = 'file'
         WHERE school_id = ${schoolId}::uuid`;
      summary.sessionsDeleted += await tx.$executeRaw`
        DELETE FROM sessions WHERE school_id = ${schoolId}::uuid`;
      await tx.$executeRaw`DELETE FROM password_reset_tokens WHERE school_id = ${schoolId}::uuid`;
    });
    summary.schools += 1;
  }
  await db.$executeRaw`UPDATE schools SET contact_email = NULL, contact_phone = NULL`;
  // Audit rows never hold personal values by design (B20) — except the
  // operator's free-text reason, which might. The append-only trigger is
  // lifted for this one statement, in this copy only, and restored.
  await db.$transaction([
    db.$executeRaw`ALTER TABLE audit_events DISABLE TRIGGER audit_events_immutable`,
    db.$executeRaw`UPDATE audit_events SET reason = 'Reason removed in an anonymised copy.' WHERE reason IS NOT NULL`,
    db.$executeRaw`ALTER TABLE audit_events ENABLE TRIGGER audit_events_immutable`,
  ]);
  return summary;
}
