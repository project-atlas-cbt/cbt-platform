/**
 * B2 Testing requirements: "Unit | Every scope predicate; the effective-
 * access function against a truth table derived from 02." This file
 * covers the table's own structural integrity plus the specific DoD
 * assertions the roadmap names by number (backend-roadmap.md's B2
 * Definition of Done, items 5–9) — the effective-access *function* itself
 * (apps/api's AuthorizationService) has its own truth-table test that
 * imports this same table.
 */
import { describe, expect, it } from 'vitest';
import { ROLES } from '../roles.js';
import { PERMISSION_TABLE, findPermissionRule, requirePermissionRule } from './permission-table.js';
import { SCOPE_PREDICATES } from './scope.js';
import { PERMISSION_ACTIONS } from './action.js';

describe('PERMISSION_TABLE structural integrity', () => {
  it('is non-empty', () => {
    expect(PERMISSION_TABLE.length).toBeGreaterThan(100);
  });

  it('has a unique id per rule', () => {
    const ids = PERMISSION_TABLE.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('declares a grant for every one of the six canonical roles, no more, no fewer', () => {
    for (const rule of PERMISSION_TABLE) {
      const grantedRoles = Object.keys(rule.grants).sort();
      expect(grantedRoles, `rule "${rule.id}"`).toEqual([...ROLES].sort());
    }
  });

  it('every action is one of the closed PermissionAction set', () => {
    for (const rule of PERMISSION_TABLE) {
      expect(PERMISSION_ACTIONS, `rule "${rule.id}"`).toContain(rule.action);
    }
  });

  it('every GRANTED/LIMITED grant uses a scope from the closed predicate set', () => {
    for (const rule of PERMISSION_TABLE) {
      for (const [role, grant] of Object.entries(rule.grants)) {
        if (grant.kind === 'GRANTED') {
          expect(SCOPE_PREDICATES, `rule "${rule.id}" role "${role}"`).toContain(grant.scope);
        }
      }
    }
  });

  it('a DEFERRED grant always carries a note explaining what it is waiting on', () => {
    for (const rule of PERMISSION_TABLE) {
      for (const [role, grant] of Object.entries(rule.grants)) {
        if (grant.kind === 'DEFERRED') {
          expect(grant.note, `rule "${rule.id}" role "${role}"`).toBeTruthy();
        }
      }
    }
  });

  it('findPermissionRule / requirePermissionRule agree', () => {
    const first = PERMISSION_TABLE[0]!;
    expect(findPermissionRule(first.id)).toBe(first);
    expect(requirePermissionRule(first.id)).toBe(first);
    expect(findPermissionRule('no-such-rule')).toBeUndefined();
    expect(() => requirePermissionRule('no-such-rule')).toThrow(/Unknown permission rule/);
  });
});

describe('PERMISSION_TABLE — ADR-0012: SOFTWARE_ADMIN is not a wildcard', () => {
  it('is never GRANTED at SCHOOL/DEPARTMENT/ASSIGNED/OWNED scope — only PLATFORM (read), SELF (own account, same as every role), or BREAK_GLASS (write) on school-owned rows', () => {
    // account.* rows are universal "manage your own identity" capabilities
    // every role gets identically (02's own ✓ cells) — not a school-academic
    // authority question ADR-0012 speaks to at all.
    const selfAccountRowIds = new Set([
      'account.resetOwnPassword',
      'account.changeOwnProfile',
      'identity.me.read',
      'identity.session.manage',
      'identity.permissions.read',
      // B10: same "universal own-identity capability" shape — every role,
      // including Software Admin, only ever sees/marks-read their own
      // notifications.
      'notification.viewOwn',
      'notification.markRead',
    ]);
    for (const rule of PERMISSION_TABLE) {
      if (selfAccountRowIds.has(rule.id)) continue;
      const grant = rule.grants.SOFTWARE_ADMIN;
      if (grant.kind === 'GRANTED') {
        expect(
          grant.scope,
          `rule "${rule.id}": Software Admin GRANTED must be PLATFORM-scoped, never a school-internal scope`,
        ).toBe('PLATFORM');
      }
    }
  });

  it('is denied outright on every content-authoring row (ADR-0012 category 4)', () => {
    const contentAuthoringIds = [
      'exam.create',
      'questionBank.approve',
      'questionBank.reject',
      'questionBank.requestChanges',
      'results.publish',
      'results.unpublish',
    ];
    for (const id of contentAuthoringIds) {
      expect(requirePermissionRule(id).grants.SOFTWARE_ADMIN.kind, id).toBe('DENIED');
    }
  });

  it('requires break-glass for the write actions ADR-0012 names explicitly', () => {
    const namedBreakGlassIds = [
      'examAdmin.invalidateAttempt',
      'examAdmin.grantMakeup',
      'questionBank.archive',
      'account.forcePasswordReset',
      'account.deactivate',
    ];
    for (const id of namedBreakGlassIds) {
      expect(requirePermissionRule(id).grants.SOFTWARE_ADMIN.kind, id).toBe('BREAK_GLASS');
    }
  });
});

describe('PERMISSION_TABLE — DoD item 5: teacher scoping (02 rule 1)', () => {
  it('question bank / exam capabilities are ASSIGNED or OWNED, never bare SCHOOL', () => {
    const teacherRuleIds = [
      'questionBank.view',
      'questionBank.create',
      'exam.create',
      'exam.editDraft',
    ];
    for (const id of teacherRuleIds) {
      const grant = requirePermissionRule(id).grants.TEACHER;
      expect(grant.kind, id).toBe('GRANTED');
      if (grant.kind === 'GRANTED') {
        expect(['ASSIGNED', 'OWNED'], id).toContain(grant.scope);
      }
    }
  });
});

describe('PERMISSION_TABLE — DoD item 6: HOD department scoping (02 rule 2)', () => {
  it('question review and department analytics are DEPARTMENT-scoped, never bare SCHOOL', () => {
    const hodRuleIds = ['questionBank.review', 'questionBank.approve', 'analytics.department'];
    for (const id of hodRuleIds) {
      const grant = requirePermissionRule(id).grants.HOD;
      expect(grant.kind, id).toBe('GRANTED');
      if (grant.kind === 'GRANTED') {
        expect(grant.scope, id).toBe('DEPARTMENT');
      }
    }
  });
});

describe('PERMISSION_TABLE — DoD item 7: a moderator cannot approve a question (02 rule 3)', () => {
  it('MODERATOR is denied on every question-review-decision row', () => {
    for (const id of [
      'questionBank.approve',
      'questionBank.reject',
      'questionBank.requestChanges',
    ]) {
      expect(requirePermissionRule(id).grants.MODERATOR.kind, id).toBe('DENIED');
    }
  });
});

describe('PERMISSION_TABLE — DoD item 8: a student reaches only their own resources (02 rule 9)', () => {
  it('every STUDENT grant is SELF-scoped, SYSTEM, or DENIED — never DEPARTMENT/ASSIGNED/OWNED/PLATFORM, with one named narrow exception', () => {
    // 02's own matrix gives students a field-limited SCHOOL-scope read of
    // the school profile (needed for branding/basic identification) — a
    // single, deliberate, narrow exception, not a general widening of the
    // tiny student surface (02 rule 9).
    const namedSchoolScopeExceptions = new Set(['schoolConfig.profile.view']);
    for (const rule of PERMISSION_TABLE) {
      const grant = rule.grants.STUDENT;
      if (grant.kind === 'GRANTED') {
        if (namedSchoolScopeExceptions.has(rule.id)) {
          expect(grant.scope, `rule "${rule.id}"`).toBe('SCHOOL');
        } else {
          expect(grant.scope, `rule "${rule.id}"`).toBe('SELF');
        }
      } else {
        expect(['DENIED', 'SYSTEM', 'DEFERRED'], `rule "${rule.id}"`).toContain(grant.kind);
      }
    }
  });

  it('has no access to the question bank, other students, or platform/school administration', () => {
    for (const id of [
      'questionBank.view',
      'users.export',
      'platform.school.viewAll',
      'schoolConfig.department.view',
    ]) {
      expect(requirePermissionRule(id).grants.STUDENT.kind, id).toBe('DENIED');
    }
  });
});

describe('PERMISSION_TABLE — ADR-0017 deferral is applied consistently', () => {
  it('HOD "request/approve" capabilities are DEFERRED, not silently granted', () => {
    for (const id of [
      'assignments.teacherToSubject',
      'assignments.teacherToClass',
      'assignments.moveStudent',
    ]) {
      expect(requirePermissionRule(id).grants.HOD.kind, id).toBe('DEFERRED');
    }
  });
});
