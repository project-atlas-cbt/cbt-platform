import { Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { prisma } from '@atlas/db';
import { AppHttpException } from '../../common/app-http-exception.js';
import { PlatformSessionService } from './platform-session.service.js';

/**
 * Software Admin's equivalent of identity/auth.guard.ts's AuthGuard —
 * resolves the platform session cookie into `request.user` (the PLATFORM-
 * kind AuthenticatedPlatformUser variant), live against the database on
 * every call, same as the school-scoped guard (09 §25: roles are never
 * trusted from the session row itself). One generic UNAUTHENTICATED
 * failure covers every rejection reason, matching AuthGuard's own
 * enumeration-resistance reasoning.
 *
 * No forced-password-change gate here (contrast AuthGuard): there is no
 * `/v1/platform/auth/password/change` endpoint in B3's scope — the seeded
 * Software Admin account ships with a usable password directly (see
 * packages/db/prisma/seed.ts), not a MUST_CHANGE_PASSWORD one. Recorded as
 * Candidate/Deferred (self-service Software Admin password change) rather
 * than built to fill the gap.
 */
@Injectable()
export class PlatformAuthGuard implements CanActivate {
  constructor(private readonly sessions: PlatformSessionService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<FastifyRequest>();
    const unauthenticated = () =>
      new AppHttpException({ code: 'UNAUTHENTICATED', message: 'Authentication required.' });

    const session = await this.sessions.resolve(req);
    if (!session) throw unauthenticated();

    const user = await prisma.user.findUnique({ where: { id: session.userId } });
    if (!user || user.status !== 'ACTIVE') throw unauthenticated();

    const roleAssignments = await prisma.platformRoleAssignment.findMany({
      where: { userId: user.id, status: 'ACTIVE' },
    });
    if (roleAssignments.length === 0) throw unauthenticated();

    req.user = {
      kind: 'PLATFORM',
      userId: user.id,
      sessionId: session.sessionId,
      roles: roleAssignments.map((r) => r.role),
    };
    return true;
  }
}
