import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Post, Req } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import type { FastifyRequest } from 'fastify';
import { Authorized } from '../authorization/decorators.js';
import { actorFromAuthenticatedUser } from '../authorization/permission.guard.js';
import type { AuthenticatedUser } from '../identity/auth.guard.js';
import { StatusResponseDto } from '../identity/dto/status-response.dto.js';
import { ParticipationService } from './participation.service.js';
import { AttemptAuthorizationResponseDto, ConfirmAbsencesDto, ExamParticipationResponseDto, GrantAttemptAuthorizationDto, InvalidateAttemptDto, RevokeAttemptAuthorizationDto } from './dto/participation.dto.js';
const user=(req: FastifyRequest)=>req.user as AuthenticatedUser;
@ApiTags('participation') @Controller()
export class ParticipationController {
 constructor(private readonly service: ParticipationService) {}
 @Get('exams/:id/participation') @Authorized('examAdmin.viewRegisteredStudents') @ApiOkResponse({ type: ExamParticipationResponseDto }) list(@Req() req:FastifyRequest,@Param('id') id:string){const u=user(req);return this.service.list(u.schoolId,actorFromAuthenticatedUser(u),id);}
 @Post('exams/:id/participation/confirm-absences') @Authorized('examAdmin.markAbsence') @ApiOkResponse({ type: ExamParticipationResponseDto }) confirm(@Req() req:FastifyRequest,@Param('id') id:string,@Body() body:ConfirmAbsencesDto){const u=user(req);return this.service.confirmAbsences(u.schoolId,actorFromAuthenticatedUser(u),id,body);}
 @Post('exams/:id/makeup-authorizations') @Authorized('examAdmin.grantMakeup') @ApiOkResponse({ type: AttemptAuthorizationResponseDto }) makeup(@Req() req:FastifyRequest,@Param('id') id:string,@Body() body:GrantAttemptAuthorizationDto){const u=user(req);return this.service.grant(u.schoolId,actorFromAuthenticatedUser(u),id,'MAKEUP',body);}
 @Post('exams/:id/retry-authorizations') @Authorized('examAdmin.grantMakeup') @ApiOkResponse({ type: AttemptAuthorizationResponseDto }) retry(@Req() req:FastifyRequest,@Param('id') id:string,@Body() body:GrantAttemptAuthorizationDto){const u=user(req);return this.service.grant(u.schoolId,actorFromAuthenticatedUser(u),id,'RETRY',body);}
 @Delete('makeup-authorizations/:id') @HttpCode(HttpStatus.NO_CONTENT) @Authorized('examAdmin.grantMakeup') async revoke(@Req() req:FastifyRequest,@Param('id') id:string,@Body() body:RevokeAttemptAuthorizationDto){const u=user(req);await this.service.revoke(u.schoolId,actorFromAuthenticatedUser(u),id,body);}
 @Post('attempts/:id/invalidate') @Authorized('examAdmin.invalidateAttempt') @ApiOkResponse({ type: StatusResponseDto }) invalidate(@Req() req:FastifyRequest,@Param('id') id:string,@Body() body:InvalidateAttemptDto){const u=user(req);return this.service.invalidate(u.schoolId,actorFromAuthenticatedUser(u),id,body);}
}
