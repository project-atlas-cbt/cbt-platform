import { Injectable, type CanActivate } from '@nestjs/common';
import { TenancyContextService } from '../../common/tenancy-context.service.js';
import { AccessGateService } from './access-gate.service.js';

/**
 * P1-3 / ADR-0015: refuses a write that the `EXPIRED` capability profile
 * blocks (new exams, questions, imports and sittings) once the school's
 * subscription grace has ended. Always runs after AuthGuard and
 * PermissionGuard (`@AuthorizedWrite`), so an unauthenticated or
 * unpermitted caller learns nothing about the subscription.
 */
@Injectable()
export class ActiveSubscriptionGuard implements CanActivate {
  constructor(
    private readonly tenancy: TenancyContextService,
    private readonly accessGate: AccessGateService,
  ) {}

  async canActivate(): Promise<boolean> {
    const schoolId = this.tenancy.schoolId;
    if (schoolId) await this.accessGate.requireActiveSubscription(schoolId);
    return true;
  }
}
