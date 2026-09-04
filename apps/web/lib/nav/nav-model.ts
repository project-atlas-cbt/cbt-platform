import type { LucideIcon } from 'lucide-react';
import {
  LayoutDashboard,
  Users,
  GraduationCap,
  BookOpen,
  FileText,
  BarChart3,
  ClipboardList,
  Settings,
  School,
  CreditCard,
  ShieldCheck,
  SlidersHorizontal,
  ClipboardCheck,
  Library,
  Monitor,
  PieChart,
  UserCircle,
} from 'lucide-react';
import type { Role } from '@atlas/domain';

/**
 * F2 scope: "Role-specific navigation per 04 §68's module map — each role
 * sees a workspace built around its job, not a generic dashboard with
 * everything exposed." Every `label`/`href` below is taken verbatim from
 * `docs/04-module-screen-map.md`'s per-role "Primary Navigation" list (§5,
 * §11, §20, §28, §35, §52) — this file is the single place that mapping
 * lives, so DoD item 1 ("no more, no less") is checkable by reading one
 * file against the spec.
 *
 * `match` names the `GET /me/permissions` `resource` id-prefix(es)
 * (`packages/domain`'s `PERMISSION_TABLE`, e.g. `questionBank.`) that make
 * this item relevant to the signed-in user — `useNavigation` (F2) grants
 * visibility if the user holds at least one non-break-glass permission
 * whose `resource` starts with any listed prefix. `match: 'always'` is
 * reserved for each role's own workspace-home item: every role holds some
 * SELF-scope grant by construction (the `identity` and `account` prefixed
 * rows), so gating the landing page itself buys no real robustness and
 * risks an empty sidebar on a misconfigured account. This is presentation
 * only (doctrine §12 / `AGENTS.md` §5) — `PermissionGuard` (B2) is what
 * actually enforces access to every route these items link to.
 */
export interface NavItem {
  id: string;
  label: string;
  /** Relative to the role's workspace root — `''` is the root itself. */
  href: string;
  icon: LucideIcon;
  match: 'always' | readonly string[];
}

export interface RoleWorkspace {
  role: Role;
  /** Root path for this role's route group, e.g. `/school`. */
  root: string;
  /** Platform-branded (Software Admin) vs. school-branded workspace — decides the shell header. */
  variant: 'platform' | 'school';
  items: readonly NavItem[];
}

export const ROLE_WORKSPACES: Record<Role, RoleWorkspace> = {
  SOFTWARE_ADMIN: {
    role: 'SOFTWARE_ADMIN',
    root: '/admin',
    variant: 'platform',
    items: [
      { id: 'dashboard', label: 'Dashboard', href: '', icon: LayoutDashboard, match: 'always' },
      {
        id: 'schools',
        label: 'Schools',
        href: 'schools',
        icon: School,
        match: ['platform.school.'],
      },
      {
        id: 'subscriptions',
        label: 'Subscriptions',
        href: 'subscriptions',
        icon: CreditCard,
        match: ['platform.subscription.'],
      },
      {
        id: 'analytics',
        label: 'Platform Analytics',
        href: 'analytics',
        icon: BarChart3,
        match: ['analytics.platform'],
      },
      {
        id: 'audit',
        label: 'Audit & Security',
        href: 'audit',
        icon: ShieldCheck,
        match: ['audit.'],
      },
      // No PERMISSION_TABLE row backs platform system configuration yet
      // (no phase has scoped it) — always-visible like Dashboard rather
      // than silently hidden, consistent with 04 §5 naming it as primary
      // nav; the destination is a placeholder until a phase claims it.
      {
        id: 'system-configuration',
        label: 'System Configuration',
        href: 'settings',
        icon: SlidersHorizontal,
        match: 'always',
      },
    ],
  },
  SCHOOL_ADMIN: {
    role: 'SCHOOL_ADMIN',
    root: '/school',
    variant: 'school',
    items: [
      { id: 'dashboard', label: 'Dashboard', href: '', icon: LayoutDashboard, match: 'always' },
      {
        id: 'people',
        label: 'People',
        href: 'people',
        icon: Users,
        match: ['users.', 'assignments.'],
      },
      {
        id: 'academics',
        label: 'Academics',
        href: 'academics',
        icon: GraduationCap,
        match: [
          'schoolConfig.department',
          'schoolConfig.class',
          'schoolConfig.subject',
          'schoolConfig.session',
          'schoolConfig.term',
        ],
      },
      {
        id: 'questions',
        label: 'Questions',
        href: 'questions',
        icon: BookOpen,
        match: ['questionBank.'],
      },
      { id: 'exams', label: 'Exams', href: 'exams', icon: ClipboardList, match: ['exam.'] },
      // F12 gap closure: School Admin holds SCHOOL-scoped `examAdmin.*`
      // grants identical in shape to Moderator's own `exam-operations` item
      // below, but had no nav item pointing at them — confirmed decision
      // (2026-09-04) to extend Control Center access to all four
      // school-side roles, not just Teacher/Moderator per the roadmap's own
      // literal route table. Copied verbatim from MODERATOR's entry.
      {
        id: 'exam-operations',
        label: 'Exam Operations',
        href: 'exam-operations',
        icon: Monitor,
        match: ['examAdmin.'],
      },
      { id: 'results', label: 'Results', href: 'results', icon: BarChart3, match: ['results.'] },
      { id: 'reports', label: 'Reports', href: 'reports', icon: FileText, match: ['reporting.'] },
      {
        id: 'settings',
        label: 'School Settings',
        href: 'settings',
        icon: Settings,
        match: [
          'schoolConfig.profile',
          'schoolConfig.logo',
          'schoolConfig.colour',
          'schoolConfig.settings',
        ],
      },
    ],
  },
  MODERATOR: {
    role: 'MODERATOR',
    root: '/moderator',
    variant: 'school',
    items: [
      { id: 'dashboard', label: 'Dashboard', href: '', icon: LayoutDashboard, match: 'always' },
      {
        id: 'people',
        label: 'People',
        href: 'people',
        icon: Users,
        match: ['users.', 'assignments.'],
      },
      {
        id: 'academics',
        label: 'Academics',
        href: 'academics',
        icon: GraduationCap,
        match: [
          'schoolConfig.department',
          'schoolConfig.class',
          'schoolConfig.subject',
          'schoolConfig.session',
          'schoolConfig.term',
        ],
      },
      // F11 gap closure: Moderator holds real `exam.*` SCHOOL-scoped grants
      // (view/edit/cancel/archive an existing exam) since B11 shipped, but
      // had no nav item pointing at them — every other role holding such a
      // grant already did. `match: ['exam.']` (this phase's oversight
      // screens) is deliberately distinct from `examAdmin.` below (B12's
      // Control Center) so the two never double-highlight.
      { id: 'exams', label: 'Exams', href: 'exams', icon: ClipboardList, match: ['exam.'] },
      {
        id: 'exam-operations',
        label: 'Exam Operations',
        href: 'exam-operations',
        icon: Monitor,
        match: ['examAdmin.'],
      },
      { id: 'reports', label: 'Reports', href: 'reports', icon: FileText, match: ['reporting.'] },
    ],
  },
  HOD: {
    role: 'HOD',
    root: '/hod',
    variant: 'school',
    items: [
      { id: 'dashboard', label: 'Dashboard', href: '', icon: LayoutDashboard, match: 'always' },
      // F6 gap closure: HOD's `schoolConfig.{department,class,subject,
      // session,term}.view` grants (packages/domain's permission table) had
      // no nav item to reach them from — every other role that holds a
      // view grant on these resources already had one. Same `match` array
      // as SCHOOL_ADMIN/MODERATOR's own `academics` item; HOD's grants are
      // view-only, so `useHasPermission` hides every mutating control
      // inside the shared screens automatically.
      {
        id: 'academics',
        label: 'Academics',
        href: 'academics',
        icon: GraduationCap,
        match: [
          'schoolConfig.department',
          'schoolConfig.class',
          'schoolConfig.subject',
          'schoolConfig.session',
          'schoolConfig.term',
        ],
      },
      {
        id: 'question-review',
        label: 'Question Review',
        href: 'question-review',
        icon: ClipboardCheck,
        match: [
          'questionBank.review',
          'questionBank.approve',
          'questionBank.reject',
          'questionBank.requestChanges',
          'questionBank.comment',
        ],
      },
      {
        id: 'question-bank',
        label: 'Question Bank',
        href: 'question-bank',
        icon: Library,
        match: ['questionBank.'],
      },
      { id: 'exams', label: 'Exams', href: 'exams', icon: ClipboardList, match: ['exam.'] },
      // F12 gap closure: HOD holds real DEPARTMENT-scoped `examAdmin.*`
      // grants (control center, roster, allow-student, mark-absence) since
      // B12 shipped, but `04 §28`'s literal nav list has no "Exam Control"
      // item — the same shape as this file's own HOD `academics` extension
      // (F6). `match` copied from TEACHER's `exam-control` item (not
      // MODERATOR's broader `'examAdmin.'`), since HOD's DEPARTMENT-scoped
      // reach is structurally closer to TEACHER's OWNED reach than to
      // MODERATOR's/SCHOOL_ADMIN's SCHOOL-wide one.
      {
        id: 'exam-control',
        label: 'Exam Control',
        href: 'exam-control',
        icon: Monitor,
        match: ['examAdmin.controlCenter'],
      },
      { id: 'results', label: 'Results', href: 'results', icon: BarChart3, match: ['results.'] },
      {
        id: 'department-analytics',
        label: 'Department Analytics',
        href: 'department-analytics',
        icon: PieChart,
        match: ['analytics.department'],
      },
      { id: 'reports', label: 'Reports', href: 'reports', icon: FileText, match: ['reporting.'] },
    ],
  },
  TEACHER: {
    role: 'TEACHER',
    root: '/teacher',
    variant: 'school',
    items: [
      { id: 'dashboard', label: 'Dashboard', href: '', icon: LayoutDashboard, match: 'always' },
      {
        id: 'my-classes',
        label: 'My Classes',
        href: 'my-classes',
        icon: GraduationCap,
        match: ['assignments.view'],
      },
      {
        id: 'question-bank',
        label: 'Question Bank',
        href: 'question-bank',
        icon: BookOpen,
        match: ['questionBank.'],
      },
      { id: 'exams', label: 'Exams', href: 'exams', icon: ClipboardList, match: ['exam.'] },
      {
        id: 'exam-control',
        label: 'Exam Control',
        href: 'exam-control',
        icon: Monitor,
        match: ['examAdmin.controlCenter'],
      },
      { id: 'results', label: 'Results', href: 'results', icon: BarChart3, match: ['results.'] },
      { id: 'reports', label: 'Reports', href: 'reports', icon: FileText, match: ['reporting.'] },
    ],
  },
  STUDENT: {
    role: 'STUDENT',
    root: '/student',
    variant: 'school',
    items: [
      // 04 §52: "Assessment / Results / Profile. That's basically it." No
      // separate "Dashboard" label for Student — Assessment *is* the home
      // screen (04 §53's Student Home shows the active-assessment card
      // directly at the workspace root).
      {
        id: 'assessment',
        label: 'Assessment',
        href: '',
        icon: ClipboardList,
        match: 'always',
      },
      {
        id: 'results',
        label: 'Results',
        href: 'results',
        icon: BarChart3,
        match: ['studentCbt.viewPreviousResults', 'results.viewIndividualResult'],
      },
      {
        id: 'profile',
        label: 'Profile',
        href: 'profile',
        icon: UserCircle,
        match: ['account.changeOwnProfile'],
      },
    ],
  },
} as const;

/** `docs/04-module-screen-map.md` §67 ("Role-Specific Dashboard Philosophy") — the one question
 *  every role's Dashboard/home screen must answer immediately. Used by each workspace's `page.tsx`
 *  until that role's real dashboard (a later, separately-scoped phase) replaces the placeholder. */
export const DASHBOARD_QUESTION: Record<Role, string> = {
  SOFTWARE_ADMIN: 'How is the platform performing?',
  SCHOOL_ADMIN: 'Is my school performing and is everything operational?',
  MODERATOR: "Is the school's data and user structure correctly configured?",
  HOD: 'Is my department academically ready and performing well?',
  TEACHER: 'Can I create, administer, and evaluate my assessments?',
  STUDENT: 'Do I have an assessment to take, and what are my published results?',
};

/** Looks up the nav item behind a workspace-relative path segment (e.g. `'people'`), for the
 *  catch-all placeholder route to render the correct title/description per destination. */
export function findNavItem(role: Role, hrefSlug: string): NavItem | undefined {
  return ROLE_WORKSPACES[role].items.find((item) => item.href === hrefSlug);
}
