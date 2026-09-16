from pathlib import Path
import re

schema_path = Path('packages/db/prisma/schema.prisma')
schema = schema_path.read_text()

schema, count = re.subn(
    r'enum ExamParticipationStatus \{.*?\n\}',
    '''enum ExamParticipationStatus {
  PENDING
  ATTENDED
  COMPLETED
  ABSENT
}''',
    schema,
    count=1,
    flags=re.S,
)
assert count == 1

new_participation = '''model ExamParticipation {
  id                   String                  @id @default(dbgenerated("uuidv7()")) @db.Uuid
  schoolId             String                  @map("school_id") @db.Uuid
  examId               String                  @map("exam_id") @db.Uuid
  examSessionId        String                  @map("exam_session_id") @db.Uuid
  studentProfileId     String                  @map("student_profile_id") @db.Uuid
  status               ExamParticipationStatus @default(PENDING)
  markedAt             DateTime                @default(now()) @map("marked_at") @db.Timestamptz(6)
  markedByMembershipId String?                 @map("marked_by_membership_id") @db.Uuid
  reason               String?

  exam           Exam           @relation(fields: [schoolId, examId], references: [schoolId, id], onDelete: Restrict)
  examSession    ExamSession    @relation(fields: [schoolId, examSessionId], references: [schoolId, id], onDelete: Restrict)
  studentProfile StudentProfile @relation(fields: [schoolId, studentProfileId], references: [schoolId, id], onDelete: Cascade)

  // Composite target used by authorization provenance constraints in the B16 migrations.
  @@unique([schoolId, id])
  // Participation is a sitting outcome, never an exam-wide singleton.
  @@unique([schoolId, examId, examSessionId, studentProfileId])
  @@index([schoolId])
  @@index([schoolId, examId])
  @@index([schoolId, examSessionId])
  @@index([schoolId, examId, status])
  @@map("exam_participations")
}'''
schema, count = re.subn(r'model ExamParticipation \{.*?\n\}', new_participation, schema, count=1, flags=re.S)
assert count == 1

needle = '  participants ExamSessionParticipant[]\n  // B13: attempts started under this specific session.'
replacement = '  participants   ExamSessionParticipant[]\n  participations ExamParticipation[]\n  // B13: attempts started under this specific session.'
assert needle in schema
schema = schema.replace(needle, replacement, 1)

schema, count = re.subn(r'\nenum AttemptParticipationStatus \{.*?\n\}\n', '\n', schema, count=1, flags=re.S)
assert count == 1
schema, count = re.subn(r'^\s*participationStatus\s+AttemptParticipationStatus.*\n', '', schema, count=1, flags=re.M)
assert count == 1
schema_path.write_text(schema)

permission_path = Path('packages/domain/src/authorization/permission-table.ts')
permissions = permission_path.read_text()
for marker in [
    "    awaitingResource: 'AttemptAuthorization (B16, ADR-0014)',\n",
    "    awaitingResource: 'ExamAttempt (B16, ADR-0014)',\n",
    "    awaitingResource: 'B16/B17 analytics',\n",
]:
    if marker == "    awaitingResource: 'B16/B17 analytics',\n":
        start = permissions.index("    id: 'analytics.studentHistory'")
        end = permissions.index("  },", start)
        block = permissions[start:end]
        assert marker in block
        permissions = permissions[:start] + block.replace(marker, '', 1) + permissions[end:]
    else:
        assert marker in permissions
        permissions = permissions.replace(marker, '', 1)
permission_path.write_text(permissions)
