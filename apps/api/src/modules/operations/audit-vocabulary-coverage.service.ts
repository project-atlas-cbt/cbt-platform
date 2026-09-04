import { Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';
import { CANONICAL_AUDIT_ACTIONS, DEFERRED_AUDIT_ACTION_IDS } from '@atlas/domain';
import { AuditActionRegistry } from './audit-action.registry.js';

/** Exactly the six 07 §11.1 actions with no producer yet, per
 * `packages/domain/src/audit/vocabulary.ts`'s own DEFERRED entries. Kept
 * here, spelled out, so a diff against `DEFERRED_AUDIT_ACTION_IDS` fails
 * loudly (not silently) if that file's set ever drifts from what this
 * service expects to still be missing. */
const EXPECTED_DEFERRED = [
  // EXAM_OPENED/EXAM_CLOSED flipped to LIVE in B12 (real producers:
  // ExamSessionService.open()/ExamLifecycleService.closeExam()).
  'MAKEUP_GRANTED',
  'ATTEMPT_INVALIDATED',
  'RESULT_PUBLISHED',
  'RESULT_ADJUSTED',
].sort();

/**
 * B10 DoD item 1 / Exit criteria: "Every action in 07 §11.1's vocabulary
 * has an emitting code path, proven by the coverage test... wired as a
 * merge blocker." Runs on every app boot (the real server and every
 * integration test that boots `AppModule`, mirroring
 * `PolicyCoverageService`'s own precedent exactly) rather than a bespoke
 * CI step — a missing registration is loud immediately, not discovered
 * later by a separate gap.
 *
 * Only asserts coverage for `status: 'LIVE'` canonical actions. `DEFERRED`
 * entries (no owning phase has shipped a producer yet) are asserted
 * *separately*, as an explicit, exact allowlist — catching the opposite
 * mistake: a future phase shipping a producer without flipping its entry
 * to `LIVE` in `packages/domain/src/audit/vocabulary.ts` first.
 */
@Injectable()
export class AuditVocabularyCoverageService implements OnApplicationBootstrap {
  private readonly logger = new Logger('AuditVocabularyCoverage');

  constructor(private readonly registry: AuditActionRegistry) {}

  onApplicationBootstrap(): void {
    this.assertFullCoverage();
  }

  assertFullCoverage(): void {
    const violations: string[] = [];
    let liveCount = 0;

    for (const canonical of CANONICAL_AUDIT_ACTIONS) {
      if (canonical.status !== 'LIVE') continue;
      liveCount += 1;
      const hasAlias = canonical.aliases.some((alias) => this.registry.has(alias));
      if (!hasAlias) {
        violations.push(
          `${canonical.id} — no registered AuditActionRegistry alias among [${canonical.aliases.join(', ')}]`,
        );
      }
    }

    if (violations.length > 0) {
      const message =
        `Audit vocabulary coverage failed: ${violations.length} LIVE canonical action(s) have no ` +
        `registered producer:\n${violations.map((v) => `  - ${v}`).join('\n')}\n` +
        'Every LIVE entry in packages/domain/src/audit/vocabulary.ts must have at least one alias ' +
        "registered by some module's AuditActionRegistry registration provider (B10 DoD item 1).";
      this.logger.error(message);
      throw new Error(message);
    }

    const actualDeferred = [...DEFERRED_AUDIT_ACTION_IDS].sort();
    if (
      actualDeferred.length !== EXPECTED_DEFERRED.length ||
      actualDeferred.some((id, i) => id !== EXPECTED_DEFERRED[i])
    ) {
      const message =
        'Audit vocabulary DEFERRED set drifted from what AuditVocabularyCoverageService expects: ' +
        `expected [${EXPECTED_DEFERRED.join(', ')}], got [${actualDeferred.join(', ')}]. ` +
        'A phase that ships a real producer for a previously-DEFERRED action must flip its ' +
        "status to 'LIVE' in packages/domain/src/audit/vocabulary.ts (and update this service's " +
        'own EXPECTED_DEFERRED list) as part of that change, not silently.';
      this.logger.error(message);
      throw new Error(message);
    }

    this.logger.log(
      `Audit vocabulary coverage OK — ${liveCount} LIVE canonical action(s) covered, ` +
        `${actualDeferred.length} DEFERRED as expected.`,
    );
  }
}
