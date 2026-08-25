import { Module } from '@nestjs/common';

/**
 * Bounded domain per 08 §5: "Platform — Software Admin, schools,
 * subscriptions, activation grants." Populated by B3; Software Admin
 * break-glass access (ADR-0012) also lands here.
 *
 * Deliberately empty in B0 — module boundary stubbed, no domain logic.
 */
@Module({})
export class PlatformModule {}
