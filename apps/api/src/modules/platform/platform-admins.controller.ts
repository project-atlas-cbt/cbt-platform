import { Controller, Get, Req } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { FastifyRequest } from 'fastify';
import { prisma } from '@atlas/db';
import { AuthorizedPlatform } from '../authorization/decorators.js';
import { type AuthenticatedPlatformUser } from '../identity/auth.guard.js';
import { PlatformAdminListResponseDto } from './dto/platform-admin.dto.js';

/**
 * F20 backend gap-closure: B20 shipped `POST /platform/auth/mfa/reset`,
 * which takes a raw `userId`, but no way to find one — the web's peer-reset
 * screen needs the list of Software Admins. Read-only, platform-only, and
 * gated on the very permission the reset itself needs, so no admin sees this
 * list unless they could act on it. Only identity and MFA status — never
 * secrets, sessions or recovery codes.
 */
@ApiTags('platform')
@Controller('platform/admins')
export class PlatformAdminsController {
  @Get()
  @AuthorizedPlatform('platform.admin.resetMfa')
  @ApiOperation({ summary: 'F20: active Software Admins with MFA status (for peer MFA reset).' })
  @ApiOkResponse({ type: PlatformAdminListResponseDto })
  async list(@Req() req: FastifyRequest): Promise<PlatformAdminListResponseDto> {
    const caller = req.user as AuthenticatedPlatformUser;
    const users = await prisma.user.findMany({
      where: {
        status: 'ACTIVE',
        platformRoleAssignments: { some: { role: 'SOFTWARE_ADMIN', status: 'ACTIVE' } },
      },
      select: {
        id: true,
        displayName: true,
        email: true,
        platformMfaCredential: { select: { confirmedAt: true } },
      },
      orderBy: { displayName: 'asc' },
    });
    return {
      admins: users.map((u) => ({
        userId: u.id,
        displayName: u.displayName,
        email: u.email,
        mfaEnrolled: Boolean(u.platformMfaCredential?.confirmedAt),
        isSelf: u.id === caller.userId,
      })),
    };
  }
}
