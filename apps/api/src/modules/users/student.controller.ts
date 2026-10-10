import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { ApiNoContentResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { FastifyRequest } from 'fastify';
import { resolveActorRole } from '../academics/actor.util.js';
import { Authorized } from '../authorization/decorators.js';
import { type AuthenticatedUser } from '../identity/auth.guard.js';
import { CredentialResetResponseDto } from './dto/credential-reset.dto.js';
import {
  CreateStudentDto,
  ListStudentsQueryDto,
  LockedOutStudentsResponseDto,
  StudentListResponseDto,
  StudentOwnProfileResponseDto,
  StudentResponseDto,
  UpdateStudentDto,
} from './dto/student.dto.js';
import { StudentService } from './student.service.js';

function currentUser(req: FastifyRequest): AuthenticatedUser {
  return req.user as AuthenticatedUser;
}

@ApiTags('people')
@Controller('students')
export class StudentController {
  constructor(private readonly students: StudentService) {}

  @Get()
  @Authorized('users.student.view')
  @ApiOperation({
    summary:
      "List the school's students (05 §9.1) — search, sort, class filter, and pagination " +
      '(F7 gap closure).',
  })
  @ApiOkResponse({ type: StudentListResponseDto })
  async list(
    @Req() req: FastifyRequest,
    @Query() query: ListStudentsQueryDto,
  ): Promise<StudentListResponseDto> {
    return this.students.list(currentUser(req).schoolId, query);
  }

  // Literal path, registered before `:id` for the same reason as `me` below.
  @Get('locked-out')
  @Authorized('users.student.resetCredentials')
  @ApiOperation({
    summary:
      'Students whose sign-in is locked right now (too many wrong tries), for one-click ' +
      'unlocking. Same permission as Unlock sign-in.',
  })
  @ApiOkResponse({ type: LockedOutStudentsResponseDto })
  async listLockedOut(@Req() req: FastifyRequest): Promise<LockedOutStudentsResponseDto> {
    return { students: await this.students.listLockedOut(currentUser(req).schoolId) };
  }

  // F14 gap-closure — registered *before* `:id` below: 'me' is a literal
  // path segment, and without this ordering Nest/Fastify would match
  // `/students/me` against `:id` first (the same literal-before-dynamic
  // rule this codebase's other `.../me`-style routes already rely on).
  @Get('me')
  @Authorized('users.student.viewOwnProfile')
  @ApiOperation({
    summary: "The signed-in student's own name, student ID, class and department (04 §62).",
  })
  @ApiOkResponse({ type: StudentOwnProfileResponseDto })
  async getOwnProfile(@Req() req: FastifyRequest): Promise<StudentOwnProfileResponseDto> {
    const user = currentUser(req);
    return this.students.getOwnProfile(user.schoolId, user.membershipId);
  }

  @Get(':id')
  @Authorized('users.student.view')
  @ApiOperation({ summary: 'Get one student profile (05 §9.2).' })
  @ApiOkResponse({ type: StudentResponseDto })
  async get(@Req() req: FastifyRequest, @Param('id') id: string): Promise<StudentResponseDto> {
    return this.students.get(currentUser(req).schoolId, id);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @Authorized('users.student.create')
  @ApiOperation({ summary: 'Create a student.' })
  @ApiOkResponse({ type: StudentResponseDto })
  async create(
    @Req() req: FastifyRequest,
    @Body() body: CreateStudentDto,
  ): Promise<StudentResponseDto> {
    const user = currentUser(req);
    return this.students.create(user.schoolId, body, {
      actorUserId: user.userId,
      actorRole: resolveActorRole(user),
    });
  }

  @Patch(':id')
  @Authorized('users.student.edit')
  @ApiOperation({ summary: 'Edit a student.' })
  @ApiOkResponse({ type: StudentResponseDto })
  async update(
    @Req() req: FastifyRequest,
    @Param('id') id: string,
    @Body() body: UpdateStudentDto,
  ): Promise<StudentResponseDto> {
    const user = currentUser(req);
    return this.students.update(user.schoolId, id, body, {
      actorUserId: user.userId,
      actorRole: resolveActorRole(user),
    });
  }

  @Post(':id/deactivate')
  @HttpCode(HttpStatus.OK)
  @Authorized('users.student.deactivate')
  @ApiOperation({ summary: "Deactivate a student's account (never deletes authored history)." })
  @ApiOkResponse({ type: StudentResponseDto })
  async deactivate(
    @Req() req: FastifyRequest,
    @Param('id') id: string,
  ): Promise<StudentResponseDto> {
    const user = currentUser(req);
    return this.students.deactivate(user.schoolId, id, {
      actorUserId: user.userId,
      actorRole: resolveActorRole(user),
    });
  }

  @Post(':id/reactivate')
  @HttpCode(HttpStatus.OK)
  @Authorized('users.student.deactivate')
  @ApiOperation({ summary: "Reactivate a student's account." })
  @ApiOkResponse({ type: StudentResponseDto })
  async reactivate(
    @Req() req: FastifyRequest,
    @Param('id') id: string,
  ): Promise<StudentResponseDto> {
    const user = currentUser(req);
    return this.students.reactivate(user.schoolId, id, {
      actorUserId: user.userId,
      actorRole: resolveActorRole(user),
    });
  }

  @Post(':id/reset-credentials')
  @HttpCode(HttpStatus.OK)
  @Authorized('users.student.resetCredentials')
  @ApiOperation({
    summary:
      'Issue a fresh system-generated password for a student (audited; the resetter sees the ' +
      'plaintext exactly once, here — never retrievable again).',
  })
  @ApiOkResponse({ type: CredentialResetResponseDto })
  async resetCredentials(
    @Req() req: FastifyRequest,
    @Param('id') id: string,
  ): Promise<CredentialResetResponseDto> {
    const user = currentUser(req);
    return this.students.resetCredentials(user.schoolId, id, {
      actorUserId: user.userId,
      actorRole: resolveActorRole(user),
    });
  }

  @Post(':id/unlock-sign-in')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Authorized('users.student.resetCredentials')
  @ApiOperation({
    summary:
      "End a student's sign-in lockout after too many wrong passwords, without changing " +
      'their password (audited).',
  })
  @ApiNoContentResponse()
  async unlockSignIn(@Req() req: FastifyRequest, @Param('id') id: string): Promise<void> {
    const user = currentUser(req);
    await this.students.unlockSignIn(user.schoolId, id, {
      actorUserId: user.userId,
      actorRole: resolveActorRole(user),
    });
  }
}
