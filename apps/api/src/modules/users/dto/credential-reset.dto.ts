import { ApiProperty } from '@nestjs/swagger';

/** The one-time reveal — CredentialSheetService's own doc comment: "the
 * plaintext exists only in the value this method returns, never again
 * after that." No GET endpoint anywhere can re-fetch this. */
export class CredentialResetResponseDto {
  @ApiProperty({ type: String })
  membershipId!: string;

  @ApiProperty({ type: String })
  loginIdentifier!: string;

  @ApiProperty({ type: String })
  initialPassword!: string;
}
