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

  it('School Admin: Dashboard, People, Academics, Questions, Exams, Exam Operations, Results, Reports, School Settings (04 §11 + F12 gap closure)', () => {
    // `04 §11`'s own list doesn't name "Exam Operations" — School Admin's
    // real SCHOOL-scoped `examAdmin.*` grants (B12's Control Center) had no
    // nav item to reach them from before F12, even though Moderator's
    // identically-shaped grant already had one (F11's own precedent).
    // Confirmed decision (2026-09-04): extend Control Center access to all
    // four school-side roles, not just Teacher/Moderator per the roadmap's
    // literal route table — see CLAUDE.md's F12 Change Log entry.
    expect(ROLE_WORKSPACES.SCHOOL_ADMIN.items.map((i) => i.label)).toEqual([
      'Dashboard',
      'People',
      'Academics',
      'Questions',
      'Exams',
      'Exam Operations',
      'Results',
      'Reports',
      'School Settings',
    ]);
  });

  it('Moderator: Dashboard, People, Academics, Exams, Exam Operations, Reports (04 §20 + F11 gap closure)', () => {
    // `04 §20`'s own list doesn't name "Exams" — Moderator's real `exam.*`
    // SCHOOL-scoped grants (view/edit/cancel/archive an existing exam,
    // packages/domain's permission table) had no nav item to reach them
    // from before F11, unlike School Admin/HOD/Teacher, who all already had
    // one. Added as a confirmed, documented gap closure (CLAUDE.md's F11
    // Change Log entry), not a silent spec deviation — mirrors HOD's own
    // F6 precedent immediately below. Distinct from "Exam Operations"
    // (`examAdmin.*`, B12's Control Center), which Moderator already had.
    expect(ROLE_WORKSPACES.MODERATOR.items.map((i) => i.label)).toEqual([
      'Dashboard',
      'People',
      'Academics',
      'Exams',
      'Exam Operations',
      'Reports',
    ]);
  });

  it('HOD: Dashboard, Academics, Question Review, Question Bank, Exams, Exam Control, Results, Department Analytics, Reports (04 §28 + F6/F12 gap closures)', () => {
    // `04 §28`'s own list doesn't name "Academics" (F6 gap closure) or
    // "Exam Control" (F12 gap closure) — HOD's real
    // `schoolConfig.{department,class,subject,session,term}.view` and
    // `examAdmin.*` DEPARTMENT-scoped grants (packages/domain's permission
    // table) had no nav item to reach them from, unlike every other role
    // holding an equivalent grant. Both added as confirmed, documented gap
    // closures (CLAUDE.md's F6/F12 Change Log entries), not silent spec
    // deviations.
    expect(ROLE_WORKSPACES.HOD.items.map((i) => i.label)).toEqual([
      'Dashboard',
      'Academics',
      'Question Review',
      'Question Bank',
      'Exams',
      'Exam Control',
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
