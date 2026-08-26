import { ApiProperty } from '@nestjs/swagger';

/**
 * Shared response shape for every auth endpoint whose only job is "the
 * thing happened, nothing further to report" — login, logout, refresh,
 * password change/reset. F1 (apps/web) is the first real consumer of this
 * document's response schemas; before this DTO existed, none of
 * IdentityController's endpoints had one, so every response type in
 * @atlas/contracts' generated client collapsed to `content?: never` —
 * found only by actually building a typed consumer against it.
 */
export class StatusResponseDto {
  @ApiProperty({ type: String, enum: ['ok'], example: 'ok' })
  status!: 'ok';
}
