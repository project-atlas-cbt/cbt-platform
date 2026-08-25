import { Module } from '@nestjs/common';

/**
 * Bounded domain per 08 §5: "Identity — Users, school memberships, roles,
 * sessions, credentials." Populated by B1 (auth.v1 contract) and read by
 * B2 (authorization/tenancy engine).
 *
 * Deliberately empty in B0 — module boundary stubbed, no domain logic.
 */
@Module({})
export class IdentityModule {}
