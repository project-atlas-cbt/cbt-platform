import { Injectable } from '@nestjs/common';
import { Prisma, prisma, withTenant, type Prisma as PrismaTypes } from '@atlas/db';
import { formalName } from '@atlas/domain';
import type { AuthenticatedUser } from '../identity/auth.guard.js';
import type { SearchResponseDto } from './dto/search.dto.js';

type Corpus = keyof SearchResponseDto;
const empty = (): SearchResponseDto => ({
  students: [],
  teachers: [],
  hods: [],
  classes: [],
  exams: [],
  questions: [],
  results: [],
});

/** FTS chooses candidates; every candidate is then re-filtered by an
 * independent, relation-scoped Prisma authorization predicate. */
@Injectable()
export class SearchService {
  async search(user: AuthenticatedUser, q: string, requested?: Corpus): Promise<SearchResponseDto> {
    const query = q.trim();
    if (query.length < 2) return empty();
    const role = user.roles.includes('SCHOOL_ADMIN')
      ? 'SCHOOL'
      : user.roles.includes('HOD')
        ? 'HOD'
        : user.roles.includes('TEACHER')
          ? 'TEACHER'
          : 'NONE';
    if (role === 'NONE') return empty();
    const wanted = new Set<Corpus>(
      (requested
        ? [requested]
        : [
            'students',
            'teachers',
            'hods',
            'classes',
            'exams',
            'questions',
            ...(role === 'HOD' ? ['results'] : []),
          ]) as Corpus[],
    );
    const out = empty();
    await withTenant(prisma, user.schoolId, async (tx) => {
      const ids = (corpus: SearchCorpus) => this.ftsIds(tx, corpus, query);
      if (wanted.has('students')) {
        const studentScope: PrismaTypes.StudentProfileWhereInput =
          role === 'HOD'
            ? {
                enrollments: {
                  some: {
                    status: 'ACTIVE',
                    classGroupSession: {
                      department: {
                        hodAssignments: {
                          some: {
                            schoolId: user.schoolId,
                            membershipId: user.membershipId,
                            status: 'ACTIVE',
                          },
                        },
                      },
                    },
                  },
                },
              }
            : role === 'TEACHER'
              ? {
                  enrollments: {
                    some: {
                      status: 'ACTIVE',
                      classGroupSession: {
                        classSubjects: {
                          some: {
                            teacherAssignments: {
                              some: {
                                teacherProfile: { membershipId: user.membershipId },
                                status: 'ACTIVE',
                              },
                            },
                          },
                        },
                      },
                    },
                  },
                }
              : {};
        const where: PrismaTypes.StudentProfileWhereInput = {
          id: { in: await ids('students') },
          ...studentScope,
        };
        const rows = await tx.studentProfile.findMany({
          where,
          take: 10,
          include: { membership: { include: { user: true } } },
        });
        out.students = rows.map((r) => ({
          id: r.id,
          label: formalName(r.membership.user),
          detail: r.studentId,
        }));
      }
      if (wanted.has('teachers') && role !== 'TEACHER') {
        const where: PrismaTypes.TeacherProfileWhereInput = {
          id: { in: await ids('teachers') },
          ...(role === 'HOD'
            ? {
                assignments: {
                  some: {
                    status: 'ACTIVE',
                    classSubject: {
                      subject: {
                        department: {
                          hodAssignments: {
                            some: {
                              schoolId: user.schoolId,
                              membershipId: user.membershipId,
                              status: 'ACTIVE',
                            },
                          },
                        },
                      },
                    },
                  },
                },
              }
            : {}),
        };
        const rows = await tx.teacherProfile.findMany({
          where,
          take: 10,
          include: { membership: { include: { user: true } } },
        });
        out.teachers = rows.map((r) => ({
          id: r.id,
          label: r.membership.user.displayName,
          detail: r.staffId,
        }));
      }
      if (wanted.has('hods') && role === 'SCHOOL') {
        const rows = await tx.hODAssignment.findMany({
          where: { membershipId: { in: await ids('hods') }, status: 'ACTIVE' },
          take: 10,
          include: { membership: { include: { user: true } }, department: true },
        });
        out.hods = rows.map((r) => ({
          id: r.membershipId,
          label: r.membership.user.displayName,
          detail: r.department.name,
        }));
      }
      if (wanted.has('classes') && role !== 'TEACHER') {
        const where: PrismaTypes.ClassGroupWhereInput = {
          id: { in: await ids('classes') },
          ...(role === 'HOD'
            ? {
                department: {
                  hodAssignments: {
                    some: {
                      schoolId: user.schoolId,
                      membershipId: user.membershipId,
                      status: 'ACTIVE',
                    },
                  },
                },
              }
            : {}),
        };
        const rows = await tx.classGroup.findMany({ where, take: 10 });
        out.classes = rows.map((r) => ({ id: r.id, label: r.name, detail: `${r.level}${r.arm}` }));
      }
      if (wanted.has('exams')) {
        const where: PrismaTypes.ExamWhereInput = {
          id: { in: await ids('exams') },
          ...(role === 'HOD'
            ? {
                department: {
                  hodAssignments: {
                    some: {
                      schoolId: user.schoolId,
                      membershipId: user.membershipId,
                      status: 'ACTIVE',
                    },
                  },
                },
              }
            : role === 'TEACHER'
              ? {
                  classes: {
                    some: {
                      classSubject: {
                        teacherAssignments: {
                          some: {
                            teacherProfile: { membershipId: user.membershipId },
                            status: 'ACTIVE',
                          },
                        },
                      },
                    },
                  },
                }
              : {}),
        };
        const rows = await tx.exam.findMany({ where, take: 10, include: { subject: true } });
        out.exams = rows.map((r) => ({ id: r.id, label: r.title, detail: r.subject.name }));
      }
      if (wanted.has('questions')) {
        const pairs =
          role === 'TEACHER'
            ? await this.teacherQuestionPairs(user.schoolId, user.membershipId)
            : [];
        const where: PrismaTypes.QuestionWhereInput = {
          id: { in: await ids('questions') },
          ...(role === 'HOD'
            ? {
                subject: {
                  department: {
                    hodAssignments: {
                      some: {
                        schoolId: user.schoolId,
                        membershipId: user.membershipId,
                        status: 'ACTIVE',
                      },
                    },
                  },
                },
              }
            : role === 'TEACHER'
              ? { OR: pairs }
              : {}),
        };
        const rows = await tx.question.findMany({
          where,
          take: 10,
          include: { subject: true, currentRevision: true },
        });
        out.questions = rows.map((r) => ({
          id: r.id,
          label: r.currentRevision?.content.slice(0, 120) ?? 'Question',
          detail: r.subject.name,
        }));
      }
      if (wanted.has('results') && role === 'HOD') {
        const rows = await tx.result.findMany({
          where: {
            studentProfileId: { in: await ids('students') },
            exam: {
              department: {
                hodAssignments: {
                  some: {
                    schoolId: user.schoolId,
                    membershipId: user.membershipId,
                    status: 'ACTIVE',
                  },
                },
              },
            },
          },
          take: 10,
          include: {
            studentProfile: { include: { membership: { include: { user: true } } } },
            exam: true,
          },
        });
        out.results = rows.map((r) => ({
          id: r.id,
          label: formalName(r.studentProfile.membership.user),
          detail: r.exam.title,
        }));
      }
    });
    return out;
  }

  private async teacherQuestionPairs(
    schoolId: string,
    membershipId: string,
  ): Promise<PrismaTypes.QuestionWhereInput[]> {
    const assignments = await withTenant(prisma, schoolId, (tx) =>
      tx.teacherAssignment.findMany({
        where: { schoolId, status: 'ACTIVE', teacherProfile: { membershipId } },
        select: {
          classSubject: {
            select: { subjectId: true, classGroupSession: { select: { level: true } } },
          },
        },
      }),
    );
    return assignments.map((a) => ({
      subjectId: a.classSubject.subjectId,
      level: a.classSubject.classGroupSession.level,
    }));
  }

  private async ftsIds(
    tx: PrismaTypes.TransactionClient,
    corpus: SearchCorpus,
    query: string,
  ): Promise<string[]> {
    const q = Prisma.sql`${query}`;
    const rows =
      corpus === 'students'
        ? await tx.$queryRaw<{ id: string }[]>(
            Prisma.sql`SELECT sp.id FROM student_profiles sp JOIN school_memberships sm ON sm.id=sp.membership_id JOIN users u ON u.id=sm.user_id WHERE to_tsvector('simple', coalesce(sp.admission_number,'')) @@ websearch_to_tsquery('simple', ${q}) OR to_tsvector('simple', coalesce(u.first_name,'') || ' ' || coalesce(u.middle_name,'') || ' ' || coalesce(u.last_name,'') || ' ' || coalesce(u.email,'')) @@ websearch_to_tsquery('simple', ${q}) LIMIT 50`,
          )
        : corpus === 'teachers'
          ? await tx.$queryRaw<{ id: string }[]>(
              Prisma.sql`SELECT tp.id FROM teacher_profiles tp JOIN school_memberships sm ON sm.id=tp.membership_id JOIN users u ON u.id=sm.user_id WHERE to_tsvector('simple', coalesce(tp.staff_id,'')) @@ websearch_to_tsquery('simple', ${q}) OR to_tsvector('simple', coalesce(u.first_name,'') || ' ' || coalesce(u.middle_name,'') || ' ' || coalesce(u.last_name,'') || ' ' || coalesce(u.email,'')) @@ websearch_to_tsquery('simple', ${q}) LIMIT 50`,
            )
          : corpus === 'hods'
            ? await tx.$queryRaw<{ id: string }[]>(
                Prisma.sql`SELECT sm.id FROM school_memberships sm JOIN users u ON u.id=sm.user_id WHERE to_tsvector('simple', coalesce(u.first_name,'') || ' ' || coalesce(u.middle_name,'') || ' ' || coalesce(u.last_name,'') || ' ' || coalesce(u.email,'')) @@ websearch_to_tsquery('simple', ${q}) LIMIT 50`,
              )
            : corpus === 'classes'
              ? await tx.$queryRaw<{ id: string }[]>(
                  Prisma.sql`SELECT id FROM class_groups WHERE to_tsvector('simple', coalesce(name,'') || ' ' || coalesce(arm,'')) @@ websearch_to_tsquery('simple', ${q}) LIMIT 50`,
                )
              : corpus === 'exams'
                ? await tx.$queryRaw<{ id: string }[]>(
                    Prisma.sql`SELECT id FROM exams WHERE to_tsvector('simple', coalesce(title,'')) @@ websearch_to_tsquery('simple', ${q}) LIMIT 50`,
                  )
                : await tx.$queryRaw<{ id: string }[]>(
                    Prisma.sql`SELECT qr.question_id AS id FROM question_revisions qr JOIN questions qn ON qn.current_revision_id = qr.id WHERE to_tsvector('english', coalesce(qr.content,'')) @@ websearch_to_tsquery('english', ${q}) LIMIT 50`,
                  );
    return rows.map((r) => r.id);
  }
}

type SearchCorpus = 'students' | 'teachers' | 'hods' | 'classes' | 'exams' | 'questions';
