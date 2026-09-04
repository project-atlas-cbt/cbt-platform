import { Logger } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuditActionRegistry } from './audit-action.registry.js';
import { AuditVocabularyCoverageService } from './audit-vocabulary-coverage.service.js';

describe('AuditVocabularyCoverageService', () => {
  beforeEach(() => {
    vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });

  it('passes when every module registers its real LIVE canonical actions', () => {
    const registry = new AuditActionRegistry();
    registry.registerAll([
      'QUESTION_APPROVED',
      'QUESTION_REJECTED',
      'EXAM_READY',
      'EXAM_OPENED',
      'EXAM_CLOSED',
      'STUDENT_DEACTIVATED',
      'CLASS_CHANGED',
      'TEACHER_ASSIGNMENTS_REPLACED',
    ]);
    const service = new AuditVocabularyCoverageService(registry);
    expect(() => service.assertFullCoverage()).not.toThrow();
  });

  it('fails, naming the offending canonical action, when a LIVE action has no registered alias', () => {
    const registry = new AuditActionRegistry();
    // Deliberately omit CLASS_CHANGED's alias.
    registry.registerAll([
      'QUESTION_APPROVED',
      'QUESTION_REJECTED',
      'EXAM_READY',
      'EXAM_OPENED',
      'EXAM_CLOSED',
      'STUDENT_DEACTIVATED',
      'TEACHER_ASSIGNMENTS_REPLACED',
    ]);
    const service = new AuditVocabularyCoverageService(registry);
    expect(() => service.assertFullCoverage()).toThrow(/CLASS_CHANGED/);
  });

  it("accepts any one of a canonical action's multiple aliases (USER_DEACTIVATED)", () => {
    const registry = new AuditActionRegistry();
    registry.registerAll([
      'QUESTION_APPROVED',
      'QUESTION_REJECTED',
      'EXAM_READY',
      'EXAM_OPENED',
      'EXAM_CLOSED',
      'CLASS_CHANGED',
      'TEACHER_ASSIGNMENTS_REPLACED',
      // Only one of USER_DEACTIVATED's three real aliases — still enough.
      'MODERATOR_REMOVED',
    ]);
    const service = new AuditVocabularyCoverageService(registry);
    expect(() => service.assertFullCoverage()).not.toThrow();
  });
});
