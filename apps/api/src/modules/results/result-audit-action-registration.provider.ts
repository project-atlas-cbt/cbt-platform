import { Injectable, type OnModuleInit } from '@nestjs/common';
import { AuditActionRegistry } from '../operations/audit-action.registry.js';

/**
 * Registers every audit action B15's services emit.
 *
 * Two of these are canonical 07 §11.1 vocabulary entries that B10 shipped as
 * `DEFERRED` with this phase named as their owner — `RESULT_PUBLISHED` and
 * `RESULT_ADJUSTED`. Flipping them to `LIVE` in
 * `packages/domain/src/audit/vocabulary.ts` without registering a producer
 * here would fail `AuditVocabularyCoverageService` at every app boot and in
 * every integration test, which is exactly the merge-blocking guarantee B10
 * built that mechanism for.
 *
 * The other four are non-canonical action strings, registered under those
 * two canonical entries' alias lists so the vocabulary stays closed while
 * the trail keeps the distinctions that matter for reading it back:
 * publication reversal, the elevated manual override, and the two sides of
 * ADR-0010's per-result withholding.
 *
 * `RESULT_PUBLISHED` is additionally written by `apps/worker`'s marking
 * consumer, for the AUTOMATIC publication policy — that process has no Nest
 * DI and so no registration provider of its own, but it must produce this
 * exact string.
 */
@Injectable()
export class ResultAuditActionRegistrationProvider implements OnModuleInit {
  constructor(private readonly registry: AuditActionRegistry) {}

  onModuleInit(): void {
    this.registry.registerAll([
      'RESULT_PUBLISHED',
      'RESULT_UNPUBLISHED',
      'RESULT_ADJUSTED',
      'RESULT_MANUAL_OVERRIDE',
      'RESULT_WITHHELD',
      'RESULT_RELEASED',
      'GRADING_SCALE_VERSION_CREATED',
    ]);
  }
}
