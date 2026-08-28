import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { AppHttpException } from '../../common/app-http-exception.js';
import { TenancyContextService } from '../../common/tenancy-context.service.js';
import { PublicRoute } from '../authorization/decorators.js';
import { ActivationService } from './activation.service.js';
import {
  ActivationRedeemDto,
  ActivationRedeemResponseDto,
  ActivationVerifyDto,
  ActivationVerifyResponseDto,
} from './dto/activation.dto.js';

// Unauthenticated by nature (03 §3), same tighter-than-baseline throttle as
// identity.controller.ts's own AUTH_THROTTLE.
const ACTIVATION_THROTTLE = { default: { limit: 10, ttl: 60_000 } };

@ApiTags('activation')
@Controller('activation')
export class ActivationController {
  constructor(
    private readonly activation: ActivationService,
    private readonly tenancy: TenancyContextService,
  ) {}

  private requireTenant(): string {
    const schoolId = this.tenancy.schoolId;
    if (!schoolId) {
      throw new AppHttpException({
        code: 'UNAUTHENTICATED',
        message: 'No school could be resolved for this request.',
      });
    }
    return schoolId;
  }

  @Post('verify')
  @HttpCode(HttpStatus.OK)
  @Throttle(ACTIVATION_THROTTLE)
  @PublicRoute(
    'Pre-authentication by necessity — a read-only precheck before the admin has any session.',
  )
  @ApiOperation({ summary: 'Validate an activation/renewal key without consuming it (03 §3).' })
  @ApiOkResponse({ type: ActivationVerifyResponseDto })
  async verify(@Body() body: ActivationVerifyDto): Promise<ActivationVerifyResponseDto> {
    const schoolId = this.requireTenant();
    return this.activation.verify(schoolId, body.key);
  }

  @Post('redeem')
  @HttpCode(HttpStatus.OK)
  @Throttle(ACTIVATION_THROTTLE)
  @PublicRoute(
    'Pre-authentication by necessity — an INITIAL_ACTIVATION redemption has no admin session yet; key possession is the authorization for either purpose (see ActivationService doc comment).',
  )
  @ApiOperation({ summary: 'Redeem an activation/renewal key (03 §3).' })
  @ApiOkResponse({ type: ActivationRedeemResponseDto })
  async redeem(@Body() body: ActivationRedeemDto): Promise<ActivationRedeemResponseDto> {
    const schoolId = this.requireTenant();
    return this.activation.redeem(schoolId, body.key, body.newPassword);
  }
}
