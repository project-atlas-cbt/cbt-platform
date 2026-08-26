import { describe, expect, it } from 'vitest';
import { ROLE_WORKSPACES } from './nav-model';

/**
 * F2 DoD item 1: "Each role sees the navigation specified in 04 §68 — no
 * more, no less." This test pins every role's nav *labels*, in order,
 * directly against `docs/04-module-screen-map.md`'s own per-role
 * "Primary Navigation" lists (§5, §11, §20, §28, §35, §52) — a change to
 * `nav-model.ts` that drifts from the spec fails here, loudly, rather than
 * only being caught by eyeballing a sidebar.
 */
describe('ROLE_WORKSPACES — 04 §68 conformance', () => {
  it('Software Admin: Dashboard, Schools, Subscriptions, Platform Analytics, Audit & Security, System Configuration (04 §5)', () => {
    expect(ROLE_WORKSPACES.SOFTWARE_ADMIN.items.map((i) => i.label)).toEqual([
      'Dashboard',
      'Schools',
      'Subscriptions',
      'Platform Analytics',
      'Audit & Security',
      'System Configuration',
    ]);
  });

  it('School Admin: Dashboard, People, Academics, Questions, Exams, Results, Reports, School Settings (04 §11)', () => {
    expect(ROLE_WORKSPACES.SCHOOL_ADMIN.items.map((i) => i.label)).toEqual([
      'Dashboard',
      'People',
      'Academics',
      'Questions',
      'Exams',
      'Results',
      'Reports',
      'School Settings',
    ]);
  });

  it('Moderator: Dashboard, People, Academics, Exam Operations, Reports (04 §20)', () => {
    expect(ROLE_WORKSPACES.MODERATOR.items.map((i) => i.label)).toEqual([
      'Dashboard',
      'People',
      'Academics',
      'Exam Operations',
      'Reports',
    ]);
  });

  it('HOD: Dashboard, Question Review, Question Bank, Exams, Results, Department Analytics, Reports (04 §28)', () => {
    expect(ROLE_WORKSPACES.HOD.items.map((i) => i.label)).toEqual([
      'Dashboard',
      'Question Review',
      'Question Bank',
      'Exams',
      'Results',
      'Department Analytics',
      'Reports',
    ]);
  });

  it('Teacher: Dashboard, My Classes, Question Bank, Exams, Exam Control, Results, Reports (04 §35)', () => {
    expect(ROLE_WORKSPACES.TEACHER.items.map((i) => i.label)).toEqual([
      'Dashboard',
      'My Classes',
      'Question Bank',
      'Exams',
      'Exam Control',
      'Results',
      'Reports',
    ]);
  });

  it('Student: Assessment, Results, Profile — "that\'s basically it" (04 §52)', () => {
    expect(ROLE_WORKSPACES.STUDENT.items.map((i) => i.label)).toEqual([
      'Assessment',
      'Results',
      'Profile',
    ]);
  });

  it('every role root is unique and every item href is unique within its workspace', () => {
    const roots = Object.values(ROLE_WORKSPACES).map((w) => w.root);
    expect(new Set(roots).size).toBe(roots.length);

    for (const workspace of Object.values(ROLE_WORKSPACES)) {
      const hrefs = workspace.items.map((i) => i.href);
      expect(new Set(hrefs).size).toBe(hrefs.length);
    }
  });

  it('every non-"always" item declares at least one match prefix', () => {
    for (const workspace of Object.values(ROLE_WORKSPACES)) {
      for (const item of workspace.items) {
        if (item.match === 'always') continue;
        expect(item.match.length).toBeGreaterThan(0);
      }
    }
  });
});
