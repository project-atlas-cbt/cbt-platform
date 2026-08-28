import { Injectable } from '@nestjs/common';
import { prisma, withTenant } from '@atlas/db';
import { resolveAccessGate } from '@atlas/domain';
import { AppHttpException } from '../../common/app-http-exception.js';
import type {
  SchoolProfileResponseDto,
  SchoolSubscriptionStatusResponseDto,
  UpdateSchoolProfileDto,
} from './dto/school-profile.dto.js';

/** School-side reads of what SchoolsAdminService (platform-side) manages —
 * `GET/PATCH /v1/school/profile`, `GET /v1/school/subscription` (05 §3.3,
 * 03 §4 Step 1, SA-05's own field list minus platform-only history). */
@Injectable()
export class SchoolProfileService {
  async getProfile(schoolId: string): Promise<SchoolProfileResponseDto> {
    const school = await prisma.school.findUniqueOrThrow({ where: { id: schoolId } });
    return {
      id: school.id,
      name: school.name,
      subdomain: school.subdomain,
      timezone: school.timezone,
      shortName: school.shortName,
      contactEmail: school.contactEmail,
      contactPhone: school.contactPhone,
      address: school.address,
    };
  }

  async updateProfile(
    schoolId: string,
    dto: UpdateSchoolProfileDto,
  ): Promise<SchoolProfileResponseDto> {
    const school = await prisma.school.update({
      where: { id: schoolId },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.shortName !== undefined ? { shortName: dto.shortName } : {}),
        ...(dto.contactEmail !== undefined ? { contactEmail: dto.contactEmail } : {}),
        ...(dto.contactPhone !== undefined ? { contactPhone: dto.contactPhone } : {}),
        ...(dto.address !== undefined ? { address: dto.address } : {}),
      },
    });
    return {
      id: school.id,
      name: school.name,
      subdomain: school.subdomain,
      timezone: school.timezone,
      shortName: school.shortName,
      contactEmail: school.contactEmail,
      contactPhone: school.contactPhone,
      address: school.address,
    };
  }

  async getSubscription(schoolId: string): Promise<SchoolSubscriptionStatusResponseDto> {
    const school = await prisma.school.findUniqueOrThrow({
      where: { id: schoolId },
      select: { platformOverride: true },
    });
    const subscription = await withTenant(prisma, schoolId, (tx) =>
      tx.subscription.findFirst({ where: { schoolId }, orderBy: { createdAt: 'desc' } }),
    );
    if (!subscription) {
      throw new AppHttpException({ code: 'NOT_FOUND', message: 'No subscription found.' });
    }

    const gate = resolveAccessGate({
      subscriptionStatus: subscription.status,
      subscriptionExpiresAt: subscription.expiresAt,
      platformOverride: school.platformOverride,
      now: new Date(),
    });

    return {
      plan: subscription.plan,
      status: subscription.status,
      startAt: subscription.startAt.toISOString(),
      expiresAt: subscription.expiresAt.toISOString(),
      inGracePeriod: gate.status === 'EXPIRED' && gate.capability === 'FULL',
    };
  }
}
