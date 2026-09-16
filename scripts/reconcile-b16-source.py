from pathlib import Path
import re

p=Path('packages/db/prisma/schema.prisma'); s=p.read_text()
s,n=re.subn(r'enum ExamParticipationStatus \{.*?\n\}','''enum ExamParticipationStatus {
  PENDING
  ATTENDED
  COMPLETED
  ABSENT
}''',s,count=1,flags=re.S); assert n==1
model='''model ExamParticipation {
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

  @@unique([schoolId, id])
  @@unique([schoolId, examId, examSessionId, studentProfileId])
  @@index([schoolId])
  @@index([schoolId, examId])
  @@index([schoolId, examSessionId])
  @@index([schoolId, examId, status])
  @@map("exam_participations")
}'''
s,n=re.subn(r'model ExamParticipation \{.*?\n\}',model,s,count=1,flags=re.S); assert n==1
old='  participants ExamSessionParticipant[]\n  // B13: attempts started under this specific session.'
new='  participants   ExamSessionParticipant[]\n  participations ExamParticipation[]\n  // B13: attempts started under this specific session.'
assert old in s; s=s.replace(old,new,1)
s,n=re.subn(r'\nenum AttemptParticipationStatus \{.*?\n\}\n','\n',s,count=1,flags=re.S); assert n==1
s,n=re.subn(r'^\s*participationStatus\s+AttemptParticipationStatus.*\n','',s,count=1,flags=re.M); assert n==1
p.write_text(s)

p=Path('packages/domain/src/authorization/permission-table.ts'); s=p.read_text()
for marker in ["    awaitingResource: 'AttemptAuthorization (B16, ADR-0014)',\n","    awaitingResource: 'ExamAttempt (B16, ADR-0014)',\n"]:
 assert s.count(marker)==1; s=s.replace(marker,'',1)
start=s.index("    id: 'analytics.studentHistory'"); end=s.index('\n  {',start)
block=s[start:end]; marker="    awaitingResource: 'B16/B17 analytics',\n"
assert block.count(marker)==1
s=s[:start]+block.replace(marker,'',1)+s[end:]
p.write_text(s)
