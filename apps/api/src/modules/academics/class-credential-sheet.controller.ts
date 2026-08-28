import { Controller, HttpCode, HttpStatus, Param, Post, Req, Res } from '@nestjs/common';
import { ApiOperation, ApiProduces, ApiTags } from '@nestjs/swagger';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { Authorized } from '../authorization/decorators.js';
import { type AuthenticatedUser } from '../identity/auth.guard.js';
import { resolveActorRole } from './actor.util.js';
import { ClassCredentialSheetService } from './class-credential-sheet.service.js';

function currentUser(req: FastifyRequest): AuthenticatedUser {
  return req.user as AuthenticatedUser;
}

/**
 * F7 gap-closure 2. Mounted at `classes/...` alongside
 * `StudentEnrollmentController`'s own `GET classes/:id/students` route —
 * same "full per-route path off an empty class-level prefix" technique,
 * since this doesn't fit neatly under either `/students` or `/academics`.
 *
 * Returns a raw `text/csv` attachment, not the usual JSON envelope: this is
 * a one-time plaintext-password reveal
 * (`CredentialSheetService`'s own doc comment — "the plaintext exists only
 * in the value this method returns, never again after that"), and a real
 * file download matches "downloads" (DoD item 8) literally, keeping the
 * plaintext out of client-side JS state longer than the browser's own
 * download handling needs. `@Res()` **without** `passthrough: true` — the
 * handler sends the body itself and returns nothing; Nest never tries to
 * also serialize a return value on top of it. An exception thrown before
 * `res.send()` still reaches the global exception filter and the normal
 * ADR-0033 JSON envelope — only the success path is raw.
 *
 * Not idempotency-key-aware: `IdempotencyInterceptor` only activates when a
 * client sends an `Idempotency-Key` header, and replays via
 * `res.status(...); return of(existing.body)` — it has no awareness of a
 * handler that calls `res.send()` directly, so a replayed key would not
 * resend the CSV. Given this route's confirmed "regenerate unconditionally"
 * semantics, a second call safely producing a second, equally-valid
 * regenerate is an acceptable outcome — but the frontend must not attach an
 * `Idempotency-Key` header to this call.
 */
@ApiTags('people')
@Controller()
export class ClassCredentialSheetController {
  constructor(private readonly classCredentialSheets: ClassCredentialSheetService) {}

  @Post('classes/:id/credential-sheet')
  @HttpCode(HttpStatus.OK)
  @Authorized('users.student.resetCredentials')
  @ApiOperation({
    summary:
      'Regenerate and download a one-time credential sheet (CSV) for every active student in ' +
      'this class (audited; the plaintext passwords are never retrievable again).',
  })
  @ApiProduces('text/csv')
  async issue(
    @Req() req: FastifyRequest,
    @Param('id') classId: string,
    @Res() res: FastifyReply,
  ): Promise<void> {
    const user = currentUser(req);
    const csv = await this.classCredentialSheets.issueForClass(user.schoolId, classId, {
      actorUserId: user.userId,
      actorRole: resolveActorRole(user),
    });
    res
      .header('Content-Type', 'text/csv; charset=utf-8')
      .header('Content-Disposition', 'attachment; filename="class-credentials.csv"')
      .send(csv);
  }
}
