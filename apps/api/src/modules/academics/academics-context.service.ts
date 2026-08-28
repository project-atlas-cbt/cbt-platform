import { Injectable } from '@nestjs/common';
import { prisma, withTenant } from '@atlas/db';
import { AppHttpException } from '../../common/app-http-exception.js';
import type { AcademicsContextResponseDto } from './dto/academics-context.dto.js';

/** `GET /v1/academics/context` (roadmap-named endpoint, DoD item 10) — the
 * data F2's context-switcher chrome renders for every role. `session`/
 * `term` are null, not an error, until a school activates its first one. */
@Injectable()
export class AcademicsContextService {
  async get(schoolId: string): Promise<AcademicsContextResponseDto> {
    const school = await prisma.school.findUnique({
      where: { id: schoolId },
      select: { name: true },
    });
    if (!school) {
      throw new AppHttpException({ code: 'NOT_FOUND', message: 'School not found.' });
    }

    const currentSession = await withTenant(prisma, schoolId, (tx) =>
      tx.academicSession.findFirst({ where: { schoolId, status: 'CURRENT' } }),
    );

    const currentTerm = currentSession
      ? await withTenant(prisma, schoolId, (tx) =>
          tx.academicTerm.findFirst({
            where: { schoolId, academicSessionId: currentSession.id, status: 'CURRENT' },
          }),
        )
      : null;

    return {
      schoolId,
      schoolName: school.name,
      session: currentSession
        ? { id: currentSession.id, name: currentSession.name, status: currentSession.status }
        : null,
      term: currentTerm
        ? {
            id: currentTerm.id,
            name: currentTerm.name,
            sequence: currentTerm.sequence,
            status: currentTerm.status,
          }
        : null,
    };
  }
}
