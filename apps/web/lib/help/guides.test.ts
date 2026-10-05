import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { PERMISSION_TABLE, type Role } from '@atlas/domain';
import { ROLE_WORKSPACES } from '@/lib/nav/nav-model';
import { CONTEXTUAL_GUIDES } from './contextual';
import { HELP_AREA_ORDER, type Guide, type RoleGuideSet } from './types';
import { HOD_GUIDES } from './guides/hod';
import { MODERATOR_GUIDES } from './guides/moderator';
import { SCHOOL_ADMIN_GUIDES } from './guides/school-admin';
import { TEACHER_GUIDES } from './guides/teacher';

/**
 * ADR-0035 content integrity. Guides name real screens and permissions, so
 * these checks fail when a guide drifts from the app: a link to a route that
 * no longer exists, a permission the role does not hold, a related guide
 * that is gone, or a product name written literally.
 */
const SETS: readonly RoleGuideSet[] = [
  SCHOOL_ADMIN_GUIDES,
  MODERATOR_GUIDES,
  HOD_GUIDES,
  TEACHER_GUIDES,
];
const STAFF_ROLES: readonly Role[] = SETS.map((s) => s.role);
const SCHOOL_APP = path.resolve(import.meta.dirname, '../../app/(school)');

function textsOf(guide: Guide): string[] {
  return [
    guide.title,
    guide.summary,
    ...guide.keywords,
    ...guide.steps,
    ...(guide.notes ?? []),
    guide.screen?.label ?? '',
  ];
}

/** Resolves a workspace-relative href against the app router tree, allowing `[param]` folders. */
function routeExists(root: string, href: string): boolean {
  let dir = path.join(SCHOOL_APP, root.replace(/^\//, ''));
  for (const segment of href.split('/').filter(Boolean)) {
    const exact = path.join(dir, segment);
    if (existsSync(exact)) {
      dir = exact;
      continue;
    }
    const dynamic = readdirSync(dir).find((d) => /^\[[^.].*\]$/.test(d));
    if (!dynamic) return false;
    dir = path.join(dir, dynamic);
  }
  return existsSync(path.join(dir, 'page.tsx'));
}

function grantKind(role: Role, permissionId: string): string | undefined {
  return PERMISSION_TABLE.find((row) => row.id === permissionId)?.grants[role].kind;
}

describe.each(SETS.map((set) => [set.role, set] as const))('%s guides', (role, set) => {
  it('have unique kebab-case ids and complete text', () => {
    const ids = set.guides.map((g) => g.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const guide of set.guides) {
      expect(guide.id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
      expect(guide.title.trim()).not.toBe('');
      expect(guide.summary.trim()).not.toBe('');
      expect(guide.steps.length).toBeGreaterThan(0);
      expect(HELP_AREA_ORDER).toContain(guide.area);
    }
  });

  it('require only permissions this role actually holds', () => {
    for (const guide of set.guides) {
      for (const id of guide.requires) {
        expect(grantKind(role, id), `${guide.id} requires ${id}`).toBe('GRANTED');
      }
    }
  });

  it('link only to screens that exist in this workspace', () => {
    const root = ROLE_WORKSPACES[role].root;
    for (const guide of set.guides) {
      if (!guide.screen) continue;
      expect(routeExists(root, guide.screen.href), `${guide.id} → ${guide.screen.href}`).toBe(true);
    }
  });

  it('relate only to guides in the same set', () => {
    const ids = new Set(set.guides.map((g) => g.id));
    for (const guide of set.guides) {
      for (const related of guide.related ?? []) {
        expect(ids.has(related), `${guide.id} → ${related}`).toBe(true);
      }
    }
  });

  it('never write a product name literally and keep ** markers paired', () => {
    for (const guide of set.guides) {
      for (const text of textsOf(guide)) {
        expect(text, guide.id).not.toMatch(/examkeep|project atlas|\batlas\b|cbt platform/i);
        expect(text.split('**').length % 2, `${guide.id}: ${text}`).toBe(1);
      }
    }
  });
});

describe('role tailoring', () => {
  it('school-admin-only work never appears for other roles', () => {
    for (const set of [MODERATOR_GUIDES, HOD_GUIDES, TEACHER_GUIDES]) {
      const ids = set.guides.map((g) => g.id);
      for (const adminOnly of [
        'add-moderators',
        'school-profile',
        'result-policy',
        'subscription',
        'override-marks',
      ]) {
        expect(ids).not.toContain(adminOnly);
      }
    }
  });

  it('teachers get no question-review or people-management guides', () => {
    const ids = TEACHER_GUIDES.guides.map((g) => g.id);
    for (const id of ['review-questions', 'add-teachers', 'add-students', 'rollover']) {
      expect(ids).not.toContain(id);
    }
  });

  it('every staff workspace has a Help nav item and students have none', () => {
    for (const role of STAFF_ROLES) {
      expect(ROLE_WORKSPACES[role].items.map((i) => i.href)).toContain('help');
    }
    expect(ROLE_WORKSPACES.STUDENT.items.map((i) => i.href)).not.toContain('help');
    expect(existsSync(path.join(SCHOOL_APP, 'student', 'help'))).toBe(false);
  });
});

describe('contextual help links', () => {
  it.each(Object.entries(CONTEXTUAL_GUIDES))(
    '%s points at a guide every listed role has',
    (_, entry) => {
      for (const role of entry.roles) {
        const set = SETS.find((s) => s.role === role);
        expect(
          set?.guides.map((g) => g.id),
          `${role}`,
        ).toContain(entry.guideId);
      }
    },
  );
});

describe('bundle isolation', () => {
  const GUIDE_MODULES: Record<string, string> = {
    school: 'school-admin',
    moderator: 'moderator',
    hod: 'hod',
    teacher: 'teacher',
  };

  it.each(Object.entries(GUIDE_MODULES))(
    '/%s/help pages import only their own role’s guides',
    (dir, module) => {
      for (const file of ['help/page.tsx', 'help/[guide]/page.tsx']) {
        const source = readFileSync(path.join(SCHOOL_APP, dir, file), 'utf8');
        const imports = [...source.matchAll(/@\/lib\/help\/guides\/([\w-]+)/g)].map((m) => m[1]);
        expect(imports).toEqual([module]);
      }
    },
  );

  it('role guide modules never import another role’s module', () => {
    const dir = path.resolve(import.meta.dirname, 'guides');
    const roleModules = ['school-admin', 'moderator', 'hod', 'teacher'];
    for (const module of roleModules) {
      const source = readFileSync(path.join(dir, `${module}.ts`), 'utf8');
      for (const other of roleModules.filter((m) => m !== module)) {
        expect(source, `${module} imports ${other}`).not.toContain(`'./${other}'`);
      }
    }
  });
});
