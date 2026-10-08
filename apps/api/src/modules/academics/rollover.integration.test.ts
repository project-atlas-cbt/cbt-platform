import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { prisma, withTenant } from '@atlas/db';
import { RolloverService } from './rollover.service.js';
import { ownerPrisma } from '../../test-support/owner-prisma.js';

const schoolIds: string[] = [];
const userIds: string[] = [];
const actor = { actorUserId: randomUUID(), actorRole: 'SCHOOL_ADMIN' as const };
const audit = {
  record: vi.fn().mockResolvedValue(undefined),
  recordInTx: vi.fn().mockResolvedValue(undefined),
};

afterAll(async () => {
  for (const schoolId of schoolIds) {
    // A few historical FK edges are intentionally RESTRICT, so clean the
    // fixture in dependency order rather than weakening production history.
    await withTenant(prisma, schoolId, async (tx) => {
      await tx.studentSubjectRegistration.deleteMany({ where: { schoolId } });
      await tx.rolloverPlan.deleteMany({ where: { schoolId } });
      await tx.studentEnrollment.deleteMany({ where: { schoolId } });
      await tx.classSubject.deleteMany({ where: { schoolId } });
      await tx.classGroup.deleteMany({ where: { schoolId } });
      await tx.subject.deleteMany({ where: { schoolId } });
      await tx.subjectChoiceGroup.deleteMany({ where: { schoolId } });
      await tx.studentProfile.deleteMany({ where: { schoolId } });
      await tx.roleAssignment.deleteMany({ where: { schoolId } });
      await tx.schoolMembership.deleteMany({ where: { schoolId } });
    });
    await ownerPrisma().school.delete({ where: { id: schoolId } });
  }
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
});

describe('B19 rollover — atomic historical transition', () => {
  it('closes, plans, commits, preserves the old enrollment, and creates the next-session placement', async () => {
    const school = await prisma.school.create({
      data: { name: `Rollover ${randomUUID()}`, subdomain: `roll-${randomUUID().slice(0, 10)}` },
    });
    schoolIds.push(school.id);
    const user = await prisma.user.create({
      data: {
        firstName: 'Ada',
        lastName: 'Student',
        displayName: 'Ada Student',
        status: 'ACTIVE',
        credentialState: 'OK',
      },
    });
    userIds.push(user.id);
    const { source, target, enrollment } = await withTenant(prisma, school.id, async (tx) => {
      const membership = await tx.schoolMembership.create({
        data: {
          schoolId: school.id,
          userId: user.id,
          loginIdentifier: `S-${randomUUID().slice(0, 12)}`,
          status: 'ACTIVE',
        },
      });
      await tx.roleAssignment.create({
        data: { schoolId: school.id, membershipId: membership.id, role: 'STUDENT' },
      });
      const profile = await tx.studentProfile.create({
        data: {
          schoolId: school.id,
          membershipId: membership.id,
          studentId: `ST-${randomUUID().slice(0, 12)}`,
        },
      });
      const source = await tx.academicSession.create({
        data: {
          schoolId: school.id,
          name: `Source-${randomUUID().slice(0, 8)}`,
          startDate: new Date('2026-09-01'),
          endDate: new Date('2027-07-31'),
          status: 'CURRENT',
        },
      });
      const target = await tx.academicSession.create({
        data: {
          schoolId: school.id,
          name: `Target-${randomUUID().slice(0, 8)}`,
          startDate: new Date('2027-09-01'),
          endDate: new Date('2028-07-31'),
        },
      });
      await tx.academicTerm.create({
        data: {
          schoolId: school.id,
          academicSessionId: target.id,
          name: 'First Term',
          sequence: 1,
          startDate: new Date('2027-09-01'),
          endDate: new Date('2027-12-15'),
        },
      });
      const [jss1, jss2] = await Promise.all(
        ['JSS1', 'JSS2'].map((level) =>
          tx.classGroup.create({
            data: {
              schoolId: school.id,
              academicSessionId: source.id,
              name: `${level}A`,
              level: level as 'JSS1' | 'JSS2',
              arm: 'A',
            },
          }),
        ),
      );
      const subject = await tx.subject.create({
        data: { schoolId: school.id, name: 'Mathematics', code: `M-${randomUUID().slice(0, 8)}` },
      });
      await Promise.all(
        [jss1, jss2].map((classGroup) =>
          tx.classSubject.create({
            data: {
              schoolId: school.id,
              academicSessionId: source.id,
              classId: classGroup!.id,
              subjectId: subject.id,
            },
          }),
        ),
      );
      const enrollment = await tx.studentEnrollment.create({
        data: {
          schoolId: school.id,
          studentProfileId: profile.id,
          academicSessionId: source.id,
          classId: jss1!.id,
          startDate: new Date('2026-09-01'),
        },
      });
      return { source, target, enrollment };
    });

    const service = new RolloverService(audit as never);
    expect((await service.readiness(school.id, source.id)).ready).toBe(true);
    await service.close(school.id, source.id, actor);
    const plan = await service.createPlan(
      school.id,
      source.id,
      { targetAcademicSessionId: target.id },
      actor,
    );
    expect(plan.decisions).toHaveLength(1);
    await service.commit(school.id, plan.id, plan.version, actor);

    const result = await withTenant(prisma, school.id, async (tx) => ({
      source: await tx.academicSession.findUniqueOrThrow({ where: { id: source.id } }),
      target: await tx.academicSession.findUniqueOrThrow({ where: { id: target.id } }),
      targetTerm: await tx.academicTerm.findFirstOrThrow({
        where: { schoolId: school.id, academicSessionId: target.id },
      }),
      oldEnrollment: await tx.studentEnrollment.findUniqueOrThrow({ where: { id: enrollment.id } }),
      enrollments: await tx.studentEnrollment.findMany({
        where: { schoolId: school.id },
        orderBy: { createdAt: 'asc' },
      }),
      plan: await tx.rolloverPlan.findUniqueOrThrow({ where: { id: plan.id } }),
    }));
    expect(result.source.status).toBe('ARCHIVED');
    expect(result.target.status).toBe('CURRENT');
    expect(result.targetTerm.status).toBe('CURRENT');
    expect(result.oldEnrollment.status).toBe('COMPLETED');
    expect(result.enrollments).toHaveLength(2);
    expect(result.enrollments[1]?.academicSessionId).toBe(target.id);
    expect(result.plan.status).toBe('COMMITTED');
    expect(audit.recordInTx).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ action: 'ACADEMIC_ROLLOVER_COMMITTED' }),
    );
    await expect(
      withTenant(prisma, school.id, (tx) =>
        tx.rolloverDecision.updateMany({
          where: { schoolId: school.id, rolloverPlanId: plan.id },
          data: { reason: 'tamper attempt' },
        }),
      ),
    ).rejects.toThrow();
  });

  it("keeps offering kinds and each student's subjects into the next session (ADR-0038)", async () => {
    const school = await prisma.school.create({
      data: { name: `Rollover ${randomUUID()}`, subdomain: `roll-${randomUUID().slice(0, 10)}` },
    });
    schoolIds.push(school.id);
    const user = await prisma.user.create({
      data: {
        firstName: 'Bola',
        lastName: 'Student',
        displayName: 'Bola Student',
        status: 'ACTIVE',
        credentialState: 'OK',
      },
    });
    userIds.push(user.id);
    const s = school.id;
    const { source, target, subjects } = await withTenant(prisma, s, async (tx) => {
      const membership = await tx.schoolMembership.create({
        data: {
          schoolId: s,
          userId: user.id,
          loginIdentifier: `S-${randomUUID().slice(0, 12)}`,
          status: 'ACTIVE',
        },
      });
      await tx.roleAssignment.create({
        data: { schoolId: s, membershipId: membership.id, role: 'STUDENT' },
      });
      const profile = await tx.studentProfile.create({
        data: {
          schoolId: s,
          membershipId: membership.id,
          studentId: `ST-${randomUUID().slice(0, 12)}`,
        },
      });
      const source = await tx.academicSession.create({
        data: {
          schoolId: s,
          name: `Source-${randomUUID().slice(0, 8)}`,
          startDate: new Date('2026-09-01'),
          endDate: new Date('2027-07-31'),
          status: 'CURRENT',
        },
      });
      const target = await tx.academicSession.create({
        data: {
          schoolId: s,
          name: `Target-${randomUUID().slice(0, 8)}`,
          startDate: new Date('2027-09-01'),
          endDate: new Date('2028-07-31'),
        },
      });
      await tx.academicTerm.create({
        data: {
          schoolId: s,
          academicSessionId: target.id,
          name: 'First Term',
          sequence: 1,
          startDate: new Date('2027-09-01'),
          endDate: new Date('2027-12-15'),
        },
      });
      const [jss1, jss2] = await Promise.all(
        (['JSS1', 'JSS2'] as const).map((level) =>
          tx.classGroup.create({
            data: { schoolId: s, academicSessionId: source.id, name: `${level}A`, level, arm: 'A' },
          }),
        ),
      );
      const subjects: Record<string, string> = {};
      for (const name of ['Mathematics', 'French', 'CRS', 'IRS']) {
        subjects[name] = (
          await tx.subject.create({
            data: { schoolId: s, name, code: `${name.slice(0, 3)}-${randomUUID().slice(0, 6)}` },
          })
        ).id;
      }
      const offerings: Record<string, string> = {};
      for (const classGroup of [jss1!, jss2!]) {
        for (const name of Object.keys(subjects)) {
          const o = await tx.classSubject.create({
            data: {
              schoolId: s,
              academicSessionId: source.id,
              classId: classGroup.id,
              subjectId: subjects[name]!,
              kind: name === 'Mathematics' ? 'COMPULSORY' : 'ELECTIVE',
            },
          });
          if (classGroup.id === jss1!.id) offerings[name] = o.id;
        }
      }
      const enrollment = await tx.studentEnrollment.create({
        data: {
          schoolId: s,
          studentProfileId: profile.id,
          academicSessionId: source.id,
          classId: jss1!.id,
          startDate: new Date('2026-09-01'),
        },
      });
      // Took Maths and CRS; French was dropped during the year.
      await tx.studentSubjectRegistration.createMany({
        data: [
          {
            schoolId: s,
            studentEnrollmentId: enrollment.id,
            classSubjectId: offerings['Mathematics']!,
          },
          { schoolId: s, studentEnrollmentId: enrollment.id, classSubjectId: offerings['CRS']! },
          {
            schoolId: s,
            studentEnrollmentId: enrollment.id,
            classSubjectId: offerings['French']!,
            status: 'DEREGISTERED',
            deregisteredAt: new Date(),
          },
        ],
      });
      return { source, target, subjects };
    });

    const service = new RolloverService(audit as never);
    await service.close(s, source.id, actor);
    const plan = await service.createPlan(
      s,
      source.id,
      { targetAcademicSessionId: target.id },
      actor,
    );
    await service.commit(s, plan.id, plan.version, actor);

    const after = await withTenant(prisma, s, async (tx) => ({
      offerings: await tx.classSubject.findMany({
        where: { schoolId: s, academicSessionId: target.id },
        include: { classGroupSession: { select: { level: true } } },
      }),
      registrations: await tx.studentSubjectRegistration.findMany({
        where: { schoolId: s, enrollment: { academicSessionId: target.id } },
        include: { classSubject: { select: { subjectId: true } } },
      }),
    }));
    const kindOf = (name: string) =>
      after.offerings.find(
        (o) => o.subjectId === subjects[name] && o.classGroupSession.level === 'JSS2',
      )?.kind;
    expect(kindOf('Mathematics')).toBe('COMPULSORY');
    expect(kindOf('French')).toBe('ELECTIVE');
    expect(
      after.registrations
        .filter((r) => r.status === 'REGISTERED')
        .map((r) => r.classSubject.subjectId)
        .sort(),
    ).toEqual([subjects['Mathematics'], subjects['CRS']].sort());
  });

  it('allows exactly one of two simultaneous commit requests', async () => {
    const school = await prisma.school.create({
      data: { name: `Rollover ${randomUUID()}`, subdomain: `roll-${randomUUID().slice(0, 10)}` },
    });
    schoolIds.push(school.id);
    const user = await prisma.user.create({
      data: {
        firstName: 'T',
        lastName: 'S',
        displayName: 'T S',
        status: 'ACTIVE',
        credentialState: 'OK',
      },
    });
    userIds.push(user.id);
    const { source, target, enrollment, membership } = await withTenant(
      prisma,
      school.id,
      async (tx) => {
        const membership = await tx.schoolMembership.create({
          data: {
            schoolId: school.id,
            userId: user.id,
            loginIdentifier: `S-${randomUUID().slice(0, 12)}`,
            status: 'ACTIVE',
          },
        });
        await tx.roleAssignment.create({
          data: { schoolId: school.id, membershipId: membership.id, role: 'STUDENT' },
        });
        const profile = await tx.studentProfile.create({
          data: {
            schoolId: school.id,
            membershipId: membership.id,
            studentId: `ST-${randomUUID().slice(0, 12)}`,
          },
        });
        const source = await tx.academicSession.create({
          data: {
            schoolId: school.id,
            name: `Source-${randomUUID().slice(0, 8)}`,
            startDate: new Date('2026-09-01'),
            endDate: new Date('2027-07-31'),
            status: 'CURRENT',
          },
        });
        const target = await tx.academicSession.create({
          data: {
            schoolId: school.id,
            name: `Target-${randomUUID().slice(0, 8)}`,
            startDate: new Date('2027-09-01'),
            endDate: new Date('2028-07-31'),
          },
        });
        await tx.academicTerm.create({
          data: {
            schoolId: school.id,
            academicSessionId: target.id,
            name: 'First Term',
            sequence: 1,
            startDate: new Date('2027-09-01'),
            endDate: new Date('2027-12-15'),
          },
        });
        const sourceClass = await tx.classGroup.create({
          data: {
            schoolId: school.id,
            academicSessionId: source.id,
            name: 'SS3A',
            level: 'SS3',
            arm: 'A',
          },
        });
        const enrollment = await tx.studentEnrollment.create({
          data: {
            schoolId: school.id,
            studentProfileId: profile.id,
            academicSessionId: source.id,
            classId: sourceClass.id,
            startDate: new Date('2026-09-01'),
          },
        });
        return { source, target, enrollment, membership };
      },
    );
    const service = new RolloverService(audit as never);
    await service.close(school.id, source.id, actor);
    const plan = await service.createPlan(
      school.id,
      source.id,
      { targetAcademicSessionId: target.id },
      actor,
    );
    const results = await Promise.allSettled([
      service.commit(school.id, plan.id, plan.version, actor),
      service.commit(school.id, plan.id, plan.version, actor),
    ]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1);
    const [old, membershipAfter, roleAfter, userAfter] = await withTenant(prisma, school.id, (tx) =>
      Promise.all([
        tx.studentEnrollment.findUniqueOrThrow({ where: { id: enrollment.id } }),
        tx.schoolMembership.findUniqueOrThrow({ where: { id: membership.id } }),
        tx.roleAssignment.findFirst({
          where: { schoolId: school.id, membershipId: membership.id, role: 'STUDENT' },
        }),
        prisma.user.findUniqueOrThrow({ where: { id: user.id } }),
      ]),
    );
    expect(old.status).toBe('COMPLETED');
    expect(membershipAfter.status).toBe('ENDED');
    expect(roleAfter?.status).toBe('ENDED');
    expect(userAfter.status).toBe('ACTIVE');
  });

  it('rolls back completely when an invalid decision is introduced directly, preserving the source session', async () => {
    const school = await prisma.school.create({
      data: { name: `Rollover ${randomUUID()}`, subdomain: `roll-${randomUUID().slice(0, 10)}` },
    });
    schoolIds.push(school.id);
    const user = await prisma.user.create({
      data: {
        firstName: 'R',
        lastName: 'B',
        displayName: 'R B',
        status: 'ACTIVE',
        credentialState: 'OK',
      },
    });
    userIds.push(user.id);
    const { source, target } = await withTenant(prisma, school.id, async (tx) => {
      const membership = await tx.schoolMembership.create({
        data: {
          schoolId: school.id,
          userId: user.id,
          loginIdentifier: `S-${randomUUID().slice(0, 12)}`,
          status: 'ACTIVE',
        },
      });
      await tx.roleAssignment.create({
        data: { schoolId: school.id, membershipId: membership.id, role: 'STUDENT' },
      });
      const profile = await tx.studentProfile.create({
        data: {
          schoolId: school.id,
          membershipId: membership.id,
          studentId: `ST-${randomUUID().slice(0, 12)}`,
        },
      });
      const source = await tx.academicSession.create({
        data: {
          schoolId: school.id,
          name: `Source-${randomUUID().slice(0, 8)}`,
          startDate: new Date('2026-09-01'),
          endDate: new Date('2027-07-31'),
          status: 'CURRENT',
        },
      });
      const target = await tx.academicSession.create({
        data: {
          schoolId: school.id,
          name: `Target-${randomUUID().slice(0, 8)}`,
          startDate: new Date('2027-09-01'),
          endDate: new Date('2028-07-31'),
        },
      });
      await tx.academicTerm.create({
        data: {
          schoolId: school.id,
          academicSessionId: target.id,
          name: 'First Term',
          sequence: 1,
          startDate: new Date('2027-09-01'),
          endDate: new Date('2027-12-15'),
        },
      });
      const sourceClass = await tx.classGroup.create({
        data: {
          schoolId: school.id,
          academicSessionId: source.id,
          name: 'JSS1A',
          level: 'JSS1',
          arm: 'A',
        },
      });
      await tx.studentEnrollment.create({
        data: {
          schoolId: school.id,
          studentProfileId: profile.id,
          academicSessionId: source.id,
          classId: sourceClass.id,
          startDate: new Date('2026-09-01'),
        },
      });
      return { source, target };
    });
    const service = new RolloverService(audit as never);
    await service.close(school.id, source.id, actor);
    const plan = await service.createPlan(
      school.id,
      source.id,
      { targetAcademicSessionId: target.id },
      actor,
    );
    await withTenant(prisma, school.id, (tx) =>
      tx.rolloverDecision.updateMany({
        where: { schoolId: school.id, rolloverPlanId: plan.id },
        data: { targetDraftClassId: null },
      }),
    );
    await expect(service.commit(school.id, plan.id, plan.version, actor)).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
    });
    const [sourceAfter, targetAfter, targetClasses] = await withTenant(prisma, school.id, (tx) =>
      Promise.all([
        tx.academicSession.findUniqueOrThrow({ where: { id: source.id } }),
        tx.academicSession.findUniqueOrThrow({ where: { id: target.id } }),
        tx.classGroup.count({ where: { schoolId: school.id, academicSessionId: target.id } }),
      ]),
    );
    expect(sourceAfter.status).toBe('CLOSED');
    expect(targetAfter.status).toBe('DRAFT');
    expect(targetClasses).toBe(0);
  });
});
