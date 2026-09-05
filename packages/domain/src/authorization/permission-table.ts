/**
 * The normalised permission table — B2's own DoD item 1: "derived from 02,
 * resolving the undefined vocabulary in A-03 into a closed set of scope
 * predicates. This is a phase deliverable and must be reviewed and
 * approved before guards are written." Reviewable, human-readable form:
 * docs/architecture/permission-table.md (generated from this file — this
 * file is the single source of truth, never hand-duplicated there).
 *
 * Every row below traces to one labelled row of docs/02-roles-permissions.md's
 * matrix (§ "CBT Platform Permission Matrix"), in the matrix's own section
 * order. Where the matrix bundles two different action-shapes into one row
 * (e.g. "Manage departments" mixing Full and View), the row is split into
 * two table entries so a single entry never has a grant whose access level
 * exceeds its own declared `action` — flagged inline with "derived split".
 *
 * ---------------------------------------------------------------------
 * RESOLUTION RULES (A-03) — applied uniformly below; a per-row note is
 * added only where a rule's application to that specific row is itself
 * non-obvious, not for every mechanical application.
 * ---------------------------------------------------------------------
 *
 * R1  Platform operations (School/Subscription/ActivationGrant CRUD,
 *     platform analytics, platform audit) — Software Admin: unrestricted
 *     PLATFORM. Matches ADR-0012's first category exactly.
 * R2  Content authoring (create exam; create/approve/reject/request-
 *     changes question; publish/unpublish results) — Software Admin:
 *     DENIED outright. Matches ADR-0012's fourth category and the
 *     matrix's own "—" cells for these rows — no override needed.
 * R3  Every other school-owned READ the matrix gives Software Admin
 *     Full/View on — GRANTED('PLATFORM', AUDITED_READ_NOTE). ADR-0012:
 *     "School academic reads — Permitted, audited." The read-audit
 *     emission itself is B10 scope (see AUDITED_READ_NOTE).
 * R4  Every other school-owned WRITE the matrix gives Software Admin
 *     Full on (account lifecycle, assignments, exam administration
 *     writes, promotion, archiving) — BREAK_GLASS. ADR-0012 explicitly
 *     names only a subset (invalidate attempt, grant makeup, archive
 *     question, force reset, deactivate account) but frames them as
 *     examples of one category, "school academic writes"; extending the
 *     same treatment to the rest of that category (rather than only the
 *     named examples) is this table's own resolution, not itself
 *     ADR-decided — flagged for explicit review. The alternative (literal
 *     "Full" on account create/edit/remove) would let a platform actor
 *     bypass the named restrictions by creating a fresh account instead
 *     of editing an existing one, which would defeat their purpose.
 * R5  A "Limited" cell not resolved by any ADR (C-07/ADR-0012 already
 *     resolve the Create-Exam ones) — read-only at the row's natural
 *     scope, exact writable boundary left to the phase that builds the
 *     underlying resource. See `limitedReadOnly()`'s own doc comment.
 * R6  "Own X" / "Own account" / "Own actions" — OWNED for authored
 *     content (own draft question, own exam); SELF for the actor's own
 *     identity/account/audit-trail.
 * R7  "Assigned X" — ASSIGNED.
 * R8  "Department" / "Full department" — DEPARTMENT.
 * R9  "Scoped" for Teacher — ASSIGNED (02 rule 1). "Scoped" for HOD —
 *     DEPARTMENT (02 rule 2).
 * R10 "System" (matrix legend) — SYSTEM for every role; excluded from
 *     GET /v1/me/permissions' effective-capability list.
 * R11 A capability whose only documented mechanism is ADR-0017's deferred
 *     HOD request/approval subsystem ("Limited/request", "Request/
 *     approve") — DEFERRED, fail-closed until that ADR is acted on.
 * R12 C-07 / ADR-0012's own resolution: "Limited" Create-Exam cells for
 *     School Admin/Moderator/HOD — DENIED (exam authoring is a Teacher
 *     capability; these roles hold administration rights on existing
 *     exams instead).
 */
import type { Role } from '../roles.js';
import type { PermissionAction } from './action.js';
import {
  breakGlass,
  denied,
  deferred,
  granted,
  limitedReadOnly,
  system,
  type Grant,
} from './grant.js';

export type PermissionSection =
  | 'Identity & Sessions'
  | 'Platform / School'
  | 'School Configuration'
  | 'Media'
  | 'User Management'
  | 'Assignments'
  | 'Question Bank'
  | 'Question Lifecycle'
  | 'Exam Management'
  | 'Exam Administration'
  | 'Student CBT'
  | 'Results'
  | 'Analytics'
  | 'Reporting / Export'
  | 'Academic Progression'
  | 'Subscription'
  | 'Audit / Security';

export interface PermissionRule {
  /** Stable slug — never reused for a different capability once shipped
   * (GET /v1/me/permissions' contract stability depends on it, B2 Testing
   * requirements table). */
  id: string;
  section: PermissionSection;
  /** Verbatim (or near-verbatim, for split rows) matrix row label — keeps
   * this table traceable back to `02` cell by cell. */
  label: string;
  action: PermissionAction;
  grants: Record<Role, Grant>;
  /** Set when the concrete resource this rule will guard doesn't exist in
   * the schema yet — the rule is declared now (satisfying the "reviewed
   * and approved before guards are written" gate) but has no endpoint to
   * attach to, and no ASSIGNED/DEPARTMENT/OWNED resolver can query real
   * data, until the named phase lands. */
  awaitingResource?: string;
}

// B10 scoped this down deliberately, not silently: only ~5 live
// @AuthorizedPlatform GET routes exist at all as of B10 (identity.me.read,
// identity.permissions.read — about the actor's own session, not "school
// academic reads," exempt; platform.media.viewOrphanReport, no note;
// platform.school.viewAll/.viewMetrics, the only two that actually carry
// this note), against ~50 rows carrying it — almost all `awaitingResource`
// placeholders for endpoints that don't exist yet. Building a shared read-
// audit mechanism now, for two call sites, ahead of the routes that would
// give it real weight, was judged premature — recorded as a B10 Deferred
// item instead: each future phase introducing a new platform-reachable GET
// route whose row carries this note is responsible for its own read-audit
// call site when it ships (the roadmap's own B10 section, Deferred items).
const AUDITED_READ_NOTE =
  'R3: ADR-0012 "permitted, audited" — read-audit emission deferred, see B10\'s Deferred items.';
const BREAK_GLASS_WRITE_NOTE =
  "R4: ADR-0012 school-academic-write category, extended from its named examples — see this file's header.";
const ADR_0017_NOTE =
  "R11: mechanism is ADR-0017's HOD request/approval subsystem, explicitly deferred (not part of the immediate implementation) — DENIED, fail-closed, until that phase lands.";

const platformRead = () => granted('PLATFORM', AUDITED_READ_NOTE);
const breakGlassWrite = () => breakGlass(BREAK_GLASS_WRITE_NOTE);
const adr0017Deferred = () => deferred(ADR_0017_NOTE);

export const PERMISSION_TABLE: readonly PermissionRule[] = [
  // ------------------------------------------------------------------
  // Identity & Sessions — not literal 02 matrix rows (Login/"Reset own
  // password"/"Change own profile" already exist there; these three cover
  // the B1 endpoints 02 doesn't name explicitly: reading your own resolved
  // identity, managing your own session, and reading your own effective
  // permission set). Every role gets identical SELF-scope access, same as
  // 02's own universal ✓ rows.
  // ------------------------------------------------------------------
  {
    id: 'identity.me.read',
    section: 'Identity & Sessions',
    label: 'Read own resolved identity (GET /auth/me) — not an explicit 02 row.',
    action: 'READ',
    grants: {
      SOFTWARE_ADMIN: granted('SELF'),
      SCHOOL_ADMIN: granted('SELF'),
      MODERATOR: granted('SELF'),
      HOD: granted('SELF'),
      TEACHER: granted('SELF'),
      STUDENT: granted('SELF'),
    },
  },
  {
    id: 'identity.session.manage',
    section: 'Identity & Sessions',
    label: 'Manage own session (logout/refresh) — not an explicit 02 row.',
    action: 'EXECUTE',
    grants: {
      SOFTWARE_ADMIN: granted('SELF'),
      SCHOOL_ADMIN: granted('SELF'),
      MODERATOR: granted('SELF'),
      HOD: granted('SELF'),
      TEACHER: granted('SELF'),
      STUDENT: granted('SELF'),
    },
  },
  {
    id: 'identity.permissions.read',
    section: 'Identity & Sessions',
    label:
      "Read own effective permission set (GET /v1/me/permissions) — B2's own contract, not an explicit 02 row.",
    action: 'READ',
    grants: {
      SOFTWARE_ADMIN: granted('SELF'),
      SCHOOL_ADMIN: granted('SELF'),
      MODERATOR: granted('SELF'),
      HOD: granted('SELF'),
      TEACHER: granted('SELF'),
      STUDENT: granted('SELF'),
    },
  },

  // ------------------------------------------------------------------
  // Platform / School
  // ------------------------------------------------------------------
  {
    id: 'platform.school.viewAll',
    section: 'Platform / School',
    label: 'View all schools',
    action: 'READ',
    grants: {
      SOFTWARE_ADMIN: granted('PLATFORM'),
      SCHOOL_ADMIN: denied(),
      MODERATOR: denied(),
      HOD: denied(),
      TEACHER: denied(),
      STUDENT: denied(),
    },
  },
  {
    id: 'platform.school.create',
    section: 'Platform / School',
    label: 'Create school',
    action: 'CREATE',
    grants: {
      SOFTWARE_ADMIN: granted('PLATFORM'),
      SCHOOL_ADMIN: denied(),
      MODERATOR: denied(),
      HOD: denied(),
      TEACHER: denied(),
      STUDENT: denied(),
    },
  },
  {
    id: 'platform.school.activate',
    section: 'Platform / School',
    label: 'Activate school',
    action: 'EXECUTE',
    grants: {
      SOFTWARE_ADMIN: granted('PLATFORM'),
      SCHOOL_ADMIN: denied(),
      MODERATOR: denied(),
      HOD: denied(),
      TEACHER: denied(),
      STUDENT: denied(),
    },
  },
  {
    id: 'platform.school.suspend',
    section: 'Platform / School',
    label: 'Suspend school',
    action: 'EXECUTE',
    grants: {
      SOFTWARE_ADMIN: granted('PLATFORM'),
      SCHOOL_ADMIN: denied(),
      MODERATOR: denied(),
      HOD: denied(),
      TEACHER: denied(),
      STUDENT: denied(),
    },
  },
  {
    id: 'platform.subscription.renew',
    section: 'Platform / School',
    label: 'Renew subscription',
    action: 'EXECUTE',
    grants: {
      SOFTWARE_ADMIN: granted('PLATFORM'),
      SCHOOL_ADMIN: denied(),
      MODERATOR: denied(),
      HOD: denied(),
      TEACHER: denied(),
      STUDENT: denied(),
    },
  },
  {
    id: 'platform.school.revokeAccess',
    section: 'Platform / School',
    label: 'Revoke school access',
    action: 'EXECUTE',
    grants: {
      SOFTWARE_ADMIN: granted('PLATFORM'),
      SCHOOL_ADMIN: denied(),
      MODERATOR: denied(),
      HOD: denied(),
      TEACHER: denied(),
      STUDENT: denied(),
    },
  },
  {
    id: 'platform.subscription.viewStatus',
    section: 'Platform / School',
    label: 'View subscription status',
    action: 'READ',
    grants: {
      SOFTWARE_ADMIN: granted('PLATFORM'),
      SCHOOL_ADMIN: granted('SCHOOL', 'View own school.'),
      MODERATOR: denied(),
      HOD: denied(),
      TEACHER: denied(),
      STUDENT: denied(),
    },
  },
  {
    id: 'platform.school.viewMetrics',
    section: 'Platform / School',
    label: 'View school metrics',
    action: 'READ',
    grants: {
      SOFTWARE_ADMIN: platformRead(),
      SCHOOL_ADMIN: granted('SCHOOL'),
      MODERATOR: limitedReadOnly(
        'SCHOOL',
        'Exact "Limited" metrics subset finalized when B19 builds the dashboards.',
      ),
      HOD: granted('DEPARTMENT'),
      TEACHER: granted('ASSIGNED'),
      STUDENT: granted('SELF'),
    },
  },
  {
    id: 'platform.audit.view',
    section: 'Platform / School',
    label: 'Platform audit/logs',
    action: 'READ',
    grants: {
      SOFTWARE_ADMIN: granted('PLATFORM'),
      SCHOOL_ADMIN: granted('SCHOOL', 'Own school.'),
      // B10 shipped GET /v1/platform/audit as @AuthorizedPlatform-only —
      // PlatformAuthGuard admits SOFTWARE_ADMIN alone (the B2
      // PlatformRoleAssignment.role CHECK constraint), so no controller
      // route ever lets MODERATOR/HOD/TEACHER reach this specific
      // endpoint. Kept as limitedReadOnly placeholders (not converted to
      // granted(), unlike audit.viewLog's MODERATOR row below) because
      // converting would assert working access that doesn't exist — same
      // precedent as account.forcePasswordReset's HOD row. Their real
      // audit access is audit.viewLog / GET /v1/audit instead.
      MODERATOR: limitedReadOnly('SCHOOL', 'Unreachable via this endpoint — see audit.viewLog.'),
      HOD: limitedReadOnly('DEPARTMENT', 'Unreachable via this endpoint — see audit.viewLog.'),
      TEACHER: limitedReadOnly('SELF', 'Unreachable via this endpoint — see audit.viewLog.'),
      STUDENT: denied(),
    },
  },
  {
    id: 'platform.media.viewOrphanReport',
    section: 'Platform / School',
    label: 'View orphan-media report (B4)',
    action: 'READ',
    grants: {
      SOFTWARE_ADMIN: granted('PLATFORM'),
      SCHOOL_ADMIN: denied(),
      MODERATOR: denied(),
      HOD: denied(),
      TEACHER: denied(),
      STUDENT: denied(),
    },
  },

  // ------------------------------------------------------------------
  // School Configuration
  // ------------------------------------------------------------------
  {
    id: 'schoolConfig.profile.view',
    section: 'School Configuration',
    label: 'View school profile',
    action: 'READ',
    grants: {
      SOFTWARE_ADMIN: granted('PLATFORM'),
      SCHOOL_ADMIN: granted('SCHOOL'),
      MODERATOR: granted('SCHOOL'),
      HOD: granted('SCHOOL'),
      TEACHER: granted('SCHOOL'),
      STUDENT: limitedReadOnly(
        'SCHOOL',
        'Field-limited view for students; exact fields finalized in B4.',
      ),
    },
  },
  {
    id: 'schoolConfig.profile.edit',
    section: 'School Configuration',
    label: 'Edit school name/details',
    action: 'UPDATE',
    grants: {
      SOFTWARE_ADMIN: granted('PLATFORM', 'R1: school CRUD is a platform operation.'),
      SCHOOL_ADMIN: granted('SCHOOL'),
      MODERATOR: denied(),
      HOD: denied(),
      TEACHER: denied(),
      STUDENT: denied(),
    },
  },
  {
    id: 'schoolConfig.logo.upload',
    section: 'School Configuration',
    label: 'Upload/change logo',
    action: 'UPDATE',
    grants: {
      SOFTWARE_ADMIN: granted('PLATFORM', 'R1.'),
      SCHOOL_ADMIN: granted('SCHOOL'),
      MODERATOR: denied(),
      HOD: denied(),
      TEACHER: denied(),
      STUDENT: denied(),
    },
  },
  {
    id: 'schoolConfig.colour.set',
    section: 'School Configuration',
    label: 'Set primary colour',
    action: 'UPDATE',
    grants: {
      SOFTWARE_ADMIN: granted('PLATFORM', 'R1.'),
      SCHOOL_ADMIN: granted(
        'SCHOOL',
        '"Full / One-time" resolved as freely-editable, not a one-time lock (audit finding A-18) — School Admin may change the primary colour at any time; every change is audited (AuditService, action SCHOOL_BRANDING_CHANGED).',
      ),
      MODERATOR: denied(),
      HOD: denied(),
      TEACHER: denied(),
      STUDENT: denied(),
    },
  },
  {
    id: 'schoolConfig.onboarding.manage',
    section: 'School Configuration',
    label: 'Manage school onboarding wizard progress',
    action: 'UPDATE',
    grants: {
      SOFTWARE_ADMIN: granted('PLATFORM', 'R1.'),
      SCHOOL_ADMIN: granted(
        'SCHOOL',
        'F4: the ten-step onboarding wizard (03 §3, 05 §5.1-5.2) is School-Admin-only — never delegated to any other school role.',
      ),
      MODERATOR: denied(),
      HOD: denied(),
      TEACHER: denied(),
      STUDENT: denied(),
    },
  },
  {
    id: 'schoolConfig.department.view',
    section: 'School Configuration',
    label: 'Manage departments (derived split: view)',
    action: 'READ',
    grants: {
      SOFTWARE_ADMIN: platformRead(),
      SCHOOL_ADMIN: granted('SCHOOL'),
      MODERATOR: granted('SCHOOL'),
      HOD: granted(
        'SCHOOL',
        'Matrix cell is "View" — whole-school visibility, not department-limited.',
      ),
      TEACHER: denied(),
      STUDENT: denied(),
    },
  },
  {
    id: 'schoolConfig.department.manage',
    section: 'School Configuration',
    label: 'Manage departments (derived split: create/edit/delete)',
    action: 'UPDATE',
    grants: {
      SOFTWARE_ADMIN: granted(
        'PLATFORM',
        'R1: school structural/administrative setup, not academic content — flagged for review, not itself ADR-decided.',
      ),
      SCHOOL_ADMIN: granted('SCHOOL'),
      MODERATOR: granted('SCHOOL'),
      HOD: denied(),
      TEACHER: denied(),
      STUDENT: denied(),
    },
  },
  {
    id: 'schoolConfig.class.view',
    section: 'School Configuration',
    label: 'Manage classes (derived split: view)',
    action: 'READ',
    grants: {
      SOFTWARE_ADMIN: platformRead(),
      SCHOOL_ADMIN: granted('SCHOOL'),
      MODERATOR: granted('SCHOOL'),
      HOD: granted('SCHOOL'),
      TEACHER: denied(),
      STUDENT: denied(),
    },
  },
  {
    id: 'schoolConfig.class.manage',
    section: 'School Configuration',
    label: 'Manage classes (derived split: create/edit/delete)',
    action: 'UPDATE',
    grants: {
      SOFTWARE_ADMIN: granted('PLATFORM', 'R1 — see schoolConfig.department.manage.'),
      SCHOOL_ADMIN: granted('SCHOOL'),
      MODERATOR: granted('SCHOOL'),
      HOD: denied(),
      TEACHER: denied(),
      STUDENT: denied(),
    },
  },
  {
    id: 'schoolConfig.subject.view',
    section: 'School Configuration',
    label: 'Manage subjects (derived split: view)',
    action: 'READ',
    grants: {
      SOFTWARE_ADMIN: platformRead(),
      SCHOOL_ADMIN: granted('SCHOOL'),
      MODERATOR: granted('SCHOOL'),
      HOD: granted('SCHOOL'),
      TEACHER: denied(),
      STUDENT: denied(),
    },
  },
  {
    id: 'schoolConfig.subject.manage',
    section: 'School Configuration',
    label: 'Manage subjects (derived split: create/edit/delete)',
    action: 'UPDATE',
    grants: {
      SOFTWARE_ADMIN: granted('PLATFORM', 'R1 — see schoolConfig.department.manage.'),
      SCHOOL_ADMIN: granted('SCHOOL'),
      MODERATOR: granted('SCHOOL'),
      HOD: denied(),
      TEACHER: denied(),
      STUDENT: denied(),
    },
  },
  {
    id: 'schoolConfig.session.view',
    section: 'School Configuration',
    label: 'Manage academic sessions (derived split: view)',
    action: 'READ',
    grants: {
      SOFTWARE_ADMIN: platformRead(),
      SCHOOL_ADMIN: granted('SCHOOL'),
      MODERATOR: granted('SCHOOL'),
      HOD: granted('SCHOOL'),
      TEACHER: denied(),
      STUDENT: denied(),
    },
  },
  {
    id: 'schoolConfig.session.manage',
    section: 'School Configuration',
    label: 'Manage academic sessions (derived split: create/edit/delete)',
    action: 'UPDATE',
    grants: {
      SOFTWARE_ADMIN: granted('PLATFORM', 'R1 — see schoolConfig.department.manage.'),
      SCHOOL_ADMIN: granted('SCHOOL'),
      MODERATOR: granted('SCHOOL'),
      HOD: denied(),
      TEACHER: denied(),
      STUDENT: denied(),
    },
  },
  {
    id: 'schoolConfig.term.view',
    section: 'School Configuration',
    label: 'Manage terms (derived split: view)',
    action: 'READ',
    grants: {
      SOFTWARE_ADMIN: platformRead(),
      SCHOOL_ADMIN: granted('SCHOOL'),
      MODERATOR: granted('SCHOOL'),
      HOD: granted('SCHOOL'),
      TEACHER: denied(),
      STUDENT: denied(),
    },
  },
  {
    id: 'schoolConfig.term.manage',
    section: 'School Configuration',
    label: 'Manage terms (derived split: create/edit/delete)',
    action: 'UPDATE',
    grants: {
      SOFTWARE_ADMIN: granted('PLATFORM', 'R1 — see schoolConfig.department.manage.'),
      SCHOOL_ADMIN: granted('SCHOOL'),
      MODERATOR: granted('SCHOOL'),
      HOD: denied(),
      TEACHER: denied(),
      STUDENT: denied(),
    },
  },
  {
    id: 'academics.context.view',
    section: 'School Configuration',
    label: 'View current academic context (school + session + term)',
    action: 'READ',
    grants: {
      // Every role reads its *own* resolved context (no resource instance,
      // no whole-school listing involved) — SELF, not SCHOOL, matching the
      // Identity & Sessions section's identical "every role gets the same
      // self-scope access" pattern, and required by DoD item 8's tiny-
      // student-surface rule (STUDENT may only ever be SELF/SYSTEM/DENIED
      // here, with one already-named SCHOOL exception this is not). No
      // school context to view as a platform actor (Software Admin has no
      // SchoolMembership) — denied outright.
      SOFTWARE_ADMIN: denied(),
      SCHOOL_ADMIN: granted('SELF'),
      MODERATOR: granted('SELF'),
      HOD: granted('SELF'),
      TEACHER: granted('SELF'),
      STUDENT: granted('SELF'),
    },
  },
  {
    // F5 gap-closure: the resource `awaitingResource` below used to name
    // (result-policy defaults/lock, ADR-0010) now exists — split into its
    // own .view row, mirroring department/class/subject/session/term's own
    // view/manage pairing, since Moderator's confirmed posture here is
    // read-only (not the "exact writable subset TBD" placeholder this row
    // used to carry).
    id: 'schoolConfig.settings.view',
    section: 'School Configuration',
    label: 'View school settings (result policy)',
    action: 'READ',
    grants: {
      SOFTWARE_ADMIN: platformRead(),
      SCHOOL_ADMIN: granted('SCHOOL'),
      MODERATOR: granted('SCHOOL'),
      HOD: denied(),
      TEACHER: denied(),
      STUDENT: denied(),
    },
  },
  {
    id: 'schoolConfig.settings.manage',
    section: 'School Configuration',
    label: 'Manage school settings',
    action: 'UPDATE',
    grants: {
      SOFTWARE_ADMIN: granted('PLATFORM', 'R1 — see schoolConfig.department.manage.'),
      SCHOOL_ADMIN: granted('SCHOOL'),
      // F5 (confirmed with the project owner): Moderator is view-only on
      // every F5 settings screen — no edit rights anywhere in this phase,
      // consistent with their existing view-only posture on every other
      // School Configuration row. Their read access now comes from the new
      // schoolConfig.settings.view row above instead of a placeholder.
      MODERATOR: denied(),
      HOD: denied(),
      TEACHER: denied(),
      STUDENT: denied(),
    },
  },

  // ------------------------------------------------------------------
  // Media (B4) — the generic, type-polymorphic upload/access pipeline.
  // Logo upload/set is its own pair of rows above (schoolConfig.logo.upload
  // / schoolConfig.colour.set) since that's School-Admin-only and goes
  // through the branding controller, never this generic endpoint.
  // ------------------------------------------------------------------
  {
    id: 'schoolConfig.branding.view',
    section: 'Media',
    label: 'View branding (logo + primary colour + derived palette)',
    action: 'READ',
    grants: {
      SOFTWARE_ADMIN: platformRead(),
      SCHOOL_ADMIN: granted('SCHOOL'),
      MODERATOR: granted('SCHOOL'),
      HOD: granted('SCHOOL'),
      TEACHER: granted('SCHOOL'),
      STUDENT: denied(),
    },
  },
  {
    id: 'media.upload',
    section: 'Media',
    label: 'Upload media asset (question image/diagram/other)',
    action: 'CREATE',
    grants: {
      SOFTWARE_ADMIN: denied('ADR-0012: content authoring denied to Software Admin.'),
      SCHOOL_ADMIN: granted('SCHOOL'),
      MODERATOR: granted('SCHOOL'),
      HOD: granted('SCHOOL'),
      // B8 closure: real per-subject/class (ASSIGNED) scoping, evaluated
      // by QuestionsModule's own dedicated media-upload-target route
      // (POST /v1/questions/media/upload-target) against a subjectId+level
      // pair resolved through the same ADR-0001 TeacherAssignment join
      // question creation itself uses — never through the generic
      // POST /v1/media/uploads, which never constructs a ResourceContext
      // and so now correctly denies a Teacher calling it directly (the
      // same fail-closed behaviour every other ASSIGNED/DEPARTMENT
      // resolver already exhibits absent real scope). Teacher-authored
      // OTHER-type uploads are consequently unreachable until a future
      // phase defines real scope for that type — no current caller relies
      // on it.
      TEACHER: granted('ASSIGNED'),
      STUDENT: denied(),
    },
  },
  {
    id: 'media.view',
    section: 'Media',
    label: 'Get signed access URL for a non-logo media asset',
    action: 'READ',
    grants: {
      SOFTWARE_ADMIN: breakGlass(
        'Matches the established "Software Admin: read + audited break-glass" default for school content elsewhere in this table.',
      ),
      SCHOOL_ADMIN: granted('SCHOOL'),
      MODERATOR: granted('SCHOOL'),
      HOD: granted('SCHOOL'),
      TEACHER: granted('SCHOOL'),
      STUDENT: denied(
        'Students receive media via the attempt package (ADR-0021, B13), never this endpoint.',
      ),
    },
  },

  // ------------------------------------------------------------------
  // User Management — R4 applies to every Software Admin write cell here;
  // see this file's header for why account lifecycle is treated as a
  // school-academic write rather than platform-unrestricted.
  //
  // B6: the four `.view` rows below (list/get a directory) didn't exist
  // before this phase — no roadmap document names a dedicated read
  // permission distinct from `.create`, and gating a GET behind a
  // CREATE-typed id would be a real semantic mismatch. Each mirrors its
  // sibling `.create` row's grant shape exactly, a minimal additive
  // extension, not a new policy decision.
  // ------------------------------------------------------------------
  {
    id: 'users.moderator.view',
    section: 'User Management',
    label: 'View moderators',
    action: 'READ',
    grants: {
      SOFTWARE_ADMIN: platformRead(),
      SCHOOL_ADMIN: granted('SCHOOL'),
      MODERATOR: denied(),
      HOD: denied(),
      TEACHER: denied(),
      STUDENT: denied(),
    },
  },
  {
    id: 'users.moderator.create',
    section: 'User Management',
    label: 'Create Moderator',
    action: 'CREATE',
    grants: {
      SOFTWARE_ADMIN: breakGlassWrite(),
      SCHOOL_ADMIN: granted('SCHOOL'),
      MODERATOR: denied(),
      HOD: denied(),
      TEACHER: denied(),
      STUDENT: denied(),
    },
  },
  {
    id: 'users.moderator.edit',
    section: 'User Management',
    label: 'Edit Moderator',
    action: 'UPDATE',
    grants: {
      SOFTWARE_ADMIN: breakGlassWrite(),
      SCHOOL_ADMIN: granted('SCHOOL'),
      MODERATOR: denied(),
      HOD: denied(),
      TEACHER: denied(),
      STUDENT: denied(),
    },
  },
  {
    id: 'users.moderator.remove',
    section: 'User Management',
    label: 'Remove Moderator',
    action: 'DELETE',
    grants: {
      SOFTWARE_ADMIN: breakGlassWrite(),
      SCHOOL_ADMIN: granted('SCHOOL'),
      MODERATOR: denied(),
      HOD: denied(),
      TEACHER: denied(),
      STUDENT: denied(),
    },
  },
  {
    id: 'users.hod.view',
    section: 'User Management',
    label: 'View HODs',
    action: 'READ',
    grants: {
      SOFTWARE_ADMIN: platformRead(),
      SCHOOL_ADMIN: granted('SCHOOL'),
      MODERATOR: granted('SCHOOL'),
      HOD: denied(),
      TEACHER: denied(),
      STUDENT: denied(),
    },
  },
  {
    id: 'users.hod.create',
    section: 'User Management',
    label: 'Create HOD',
    action: 'CREATE',
    grants: {
      SOFTWARE_ADMIN: breakGlassWrite(),
      SCHOOL_ADMIN: granted('SCHOOL'),
      MODERATOR: granted('SCHOOL'),
      HOD: denied(),
      TEACHER: denied(),
      STUDENT: denied(),
    },
  },
  {
    id: 'users.hod.edit',
    section: 'User Management',
    label: 'Edit HOD',
    action: 'UPDATE',
    grants: {
      SOFTWARE_ADMIN: breakGlassWrite(),
      SCHOOL_ADMIN: granted('SCHOOL'),
      MODERATOR: granted('SCHOOL'),
      HOD: denied(),
      TEACHER: denied(),
      STUDENT: denied(),
    },
  },
  {
    id: 'users.hod.remove',
    section: 'User Management',
    label: 'Remove HOD',
    action: 'DELETE',
    grants: {
      SOFTWARE_ADMIN: breakGlassWrite(),
      SCHOOL_ADMIN: granted('SCHOOL'),
      MODERATOR: granted('SCHOOL'),
      HOD: denied(),
      TEACHER: denied(),
      STUDENT: denied(),
    },
  },
  {
    // F7 decision C — HOD gets its own dedicated reset-credentials route
    // (`POST /hods/:id/reset-credentials`) rather than the frontend calling
    // the underlying Teacher endpoint directly. Mirrors
    // `users.teacher.resetCredentials`'s exact grant shape.
    id: 'users.hod.resetCredentials',
    section: 'User Management',
    label: 'Reset HOD credentials',
    action: 'EXECUTE',
    grants: {
      SOFTWARE_ADMIN: breakGlassWrite(),
      SCHOOL_ADMIN: granted('SCHOOL'),
      MODERATOR: granted('SCHOOL'),
      HOD: denied(),
      TEACHER: denied(),
      STUDENT: denied(),
    },
  },
  {
    id: 'users.teacher.view',
    section: 'User Management',
    label: 'View teachers',
    action: 'READ',
    grants: {
      SOFTWARE_ADMIN: platformRead(),
      SCHOOL_ADMIN: granted('SCHOOL'),
      MODERATOR: granted('SCHOOL'),
      HOD: denied(),
      TEACHER: denied(),
      STUDENT: denied(),
    },
  },
  {
    id: 'users.teacher.create',
    section: 'User Management',
    label: 'Create Teacher',
    action: 'CREATE',
    grants: {
      SOFTWARE_ADMIN: breakGlassWrite(),
      SCHOOL_ADMIN: granted('SCHOOL'),
      MODERATOR: granted('SCHOOL'),
      HOD: denied(),
      TEACHER: denied(),
      STUDENT: denied(),
    },
  },
  {
    id: 'users.teacher.edit',
    section: 'User Management',
    label: 'Edit Teacher',
    action: 'UPDATE',
    grants: {
      SOFTWARE_ADMIN: breakGlassWrite(),
      SCHOOL_ADMIN: granted('SCHOOL'),
      MODERATOR: granted('SCHOOL'),
      HOD: denied(),
      TEACHER: denied(),
      STUDENT: denied(),
    },
  },
  {
    id: 'users.teacher.deactivate',
    section: 'User Management',
    label: 'Deactivate Teacher',
    action: 'UPDATE',
    grants: {
      SOFTWARE_ADMIN: breakGlassWrite(),
      SCHOOL_ADMIN: granted('SCHOOL'),
      MODERATOR: granted('SCHOOL'),
      HOD: denied(),
      TEACHER: denied(),
      STUDENT: denied(),
    },
  },
  {
    id: 'users.teacher.resetCredentials',
    section: 'User Management',
    label: 'Reset Teacher credentials',
    action: 'EXECUTE',
    grants: {
      SOFTWARE_ADMIN: breakGlassWrite(),
      SCHOOL_ADMIN: granted('SCHOOL'),
      MODERATOR: granted('SCHOOL'),
      HOD: denied(),
      TEACHER: denied(),
      STUDENT: denied(),
    },
  },
  {
    id: 'users.student.view',
    section: 'User Management',
    label: 'View students',
    action: 'READ',
    grants: {
      SOFTWARE_ADMIN: platformRead(),
      SCHOOL_ADMIN: granted('SCHOOL'),
      MODERATOR: granted('SCHOOL'),
      HOD: denied(),
      TEACHER: denied(),
      STUDENT: denied(),
    },
  },
  {
    id: 'users.student.create',
    section: 'User Management',
    label: 'Create Student',
    action: 'CREATE',
    grants: {
      SOFTWARE_ADMIN: breakGlassWrite(),
      SCHOOL_ADMIN: granted('SCHOOL'),
      MODERATOR: granted('SCHOOL'),
      HOD: denied(),
      TEACHER: denied(),
      STUDENT: denied(),
    },
  },
  {
    id: 'users.student.edit',
    section: 'User Management',
    label: 'Edit Student',
    action: 'UPDATE',
    grants: {
      SOFTWARE_ADMIN: breakGlassWrite(),
      SCHOOL_ADMIN: granted('SCHOOL'),
      MODERATOR: granted('SCHOOL'),
      HOD: denied(),
      TEACHER: denied(),
      STUDENT: denied(),
    },
  },
  {
    id: 'users.student.deactivate',
    section: 'User Management',
    label: 'Deactivate Student',
    action: 'UPDATE',
    grants: {
      SOFTWARE_ADMIN: breakGlassWrite(),
      SCHOOL_ADMIN: granted('SCHOOL'),
      MODERATOR: granted('SCHOOL'),
      HOD: denied(),
      TEACHER: denied(),
      STUDENT: denied(),
    },
  },
  {
    id: 'users.student.resetCredentials',
    section: 'User Management',
    label: 'Reset Student credentials',
    action: 'EXECUTE',
    grants: {
      SOFTWARE_ADMIN: breakGlassWrite(),
      SCHOOL_ADMIN: granted('SCHOOL'),
      MODERATOR: granted('SCHOOL'),
      HOD: denied(),
      TEACHER: denied(),
      STUDENT: denied(),
    },
  },
  {
    id: 'users.import.teachers',
    section: 'User Management',
    label: 'Import Teachers',
    action: 'CREATE',
    grants: {
      SOFTWARE_ADMIN: breakGlassWrite(),
      SCHOOL_ADMIN: granted('SCHOOL'),
      MODERATOR: granted('SCHOOL'),
      HOD: denied(),
      TEACHER: denied(),
      STUDENT: denied(),
    },
  },
  {
    id: 'users.import.students',
    section: 'User Management',
    label: 'Import Students',
    action: 'CREATE',
    grants: {
      SOFTWARE_ADMIN: breakGlassWrite(),
      SCHOOL_ADMIN: granted('SCHOOL'),
      MODERATOR: granted('SCHOOL'),
      HOD: denied(),
      TEACHER: denied(),
      STUDENT: denied(),
    },
    // B7: `users.import.students` also gates every type-agnostic
    // ImportJob route (GET .../:id, .../errors, POST .../confirm, GET
    // /v1/imports, GET .../templates/:type) — once a job exists, its own
    // `type` no longer changes which role may act on it, and this row's
    // grant shape is identical to `users.import.teachers`' own (same three
    // roles, same scope) for every role that matters, so either id would
    // authorize those routes identically. `imports.controller.ts`
    // documents this same reasoning at each call site rather than
    // introducing a third, purely-representational permission id.
  },
  {
    id: 'users.export',
    section: 'User Management',
    label: 'Export Users',
    action: 'READ',
    grants: {
      SOFTWARE_ADMIN: platformRead(),
      SCHOOL_ADMIN: granted('SCHOOL'),
      MODERATOR: granted('SCHOOL'),
      HOD: granted('DEPARTMENT'),
      TEACHER: granted('ASSIGNED'),
      STUDENT: denied(),
    },
    awaitingResource: 'Export pipeline (B6/B18)',
  },

  // ------------------------------------------------------------------
  // Assignments
  // ------------------------------------------------------------------
  {
    id: 'assignments.teacherToSubject',
    section: 'Assignments',
    label: 'Assign teacher → subject',
    action: 'CREATE',
    grants: {
      SOFTWARE_ADMIN: breakGlassWrite(),
      SCHOOL_ADMIN: granted('SCHOOL'),
      MODERATOR: granted('SCHOOL'),
      HOD: adr0017Deferred(),
      TEACHER: denied(),
      STUDENT: denied(),
    },
  },
  {
    id: 'assignments.teacherToClass',
    section: 'Assignments',
    label: 'Assign teacher → class',
    action: 'CREATE',
    grants: {
      SOFTWARE_ADMIN: breakGlassWrite(),
      SCHOOL_ADMIN: granted('SCHOOL'),
      MODERATOR: granted('SCHOOL'),
      HOD: adr0017Deferred(),
      TEACHER: denied(),
      STUDENT: denied(),
    },
  },
  {
    id: 'assignments.hodToDepartment',
    section: 'Assignments',
    label: 'Assign HOD → department',
    action: 'CREATE',
    grants: {
      SOFTWARE_ADMIN: breakGlassWrite(),
      SCHOOL_ADMIN: granted('SCHOOL'),
      MODERATOR: granted('SCHOOL'),
      HOD: denied(),
      TEACHER: denied(),
      STUDENT: denied(),
    },
  },
  {
    id: 'assignments.studentToClass',
    section: 'Assignments',
    label: 'Assign student → class',
    action: 'CREATE',
    grants: {
      SOFTWARE_ADMIN: breakGlassWrite(),
      SCHOOL_ADMIN: granted('SCHOOL'),
      MODERATOR: granted('SCHOOL'),
      HOD: denied(),
      TEACHER: denied(),
      STUDENT: denied(),
    },
  },
  {
    id: 'assignments.moveStudent',
    section: 'Assignments',
    label: 'Move student between classes',
    action: 'UPDATE',
    grants: {
      SOFTWARE_ADMIN: breakGlassWrite(),
      SCHOOL_ADMIN: granted('SCHOOL'),
      MODERATOR: granted('SCHOOL'),
      HOD: adr0017Deferred(),
      TEACHER: denied(),
      STUDENT: denied(),
    },
  },
  {
    id: 'assignments.view',
    section: 'Assignments',
    label: 'View assignments',
    action: 'READ',
    grants: {
      SOFTWARE_ADMIN: platformRead(),
      SCHOOL_ADMIN: granted('SCHOOL'),
      MODERATOR: granted('SCHOOL'),
      HOD: granted('DEPARTMENT'),
      TEACHER: granted(
        'SELF',
        'Their own assignment records, not the ASSIGNED-scope resources those assignments grant access to.',
      ),
      STUDENT: granted('SELF'),
    },
  },

  // ------------------------------------------------------------------
  // Question Bank
  // ------------------------------------------------------------------
  {
    id: 'questionBank.view',
    section: 'Question Bank',
    label: 'View question bank',
    action: 'READ',
    grants: {
      SOFTWARE_ADMIN: platformRead(),
      SCHOOL_ADMIN: granted('SCHOOL'),
      MODERATOR: granted('SCHOOL'),
      HOD: granted('DEPARTMENT'),
      TEACHER: granted('ASSIGNED'),
      STUDENT: denied(),
    },
  },
  {
    id: 'questionBank.create',
    section: 'Question Bank',
    label: 'Create question',
    action: 'CREATE',
    grants: {
      SOFTWARE_ADMIN: denied(),
      SCHOOL_ADMIN: denied(),
      MODERATOR: denied(),
      HOD: denied(),
      TEACHER: granted('ASSIGNED'),
      STUDENT: denied(),
    },
  },
  {
    id: 'questionBank.editOwnDraft',
    section: 'Question Bank',
    label: 'Edit own draft question',
    action: 'UPDATE',
    grants: {
      SOFTWARE_ADMIN: denied(),
      SCHOOL_ADMIN: denied(),
      MODERATOR: denied(),
      HOD: denied(),
      TEACHER: granted('OWNED'),
      STUDENT: denied(),
    },
  },
  {
    id: 'questionBank.deleteOwnDraft',
    section: 'Question Bank',
    label: 'Delete own draft question',
    action: 'DELETE',
    grants: {
      SOFTWARE_ADMIN: denied(),
      SCHOOL_ADMIN: denied(),
      MODERATOR: denied(),
      HOD: denied(),
      TEACHER: granted('OWNED'),
      STUDENT: denied(),
    },
  },
  {
    id: 'questionBank.submitForReview',
    section: 'Question Bank',
    label: 'Submit question for review',
    action: 'EXECUTE',
    grants: {
      SOFTWARE_ADMIN: denied(),
      SCHOOL_ADMIN: denied(),
      MODERATOR: denied(),
      HOD: denied(),
      TEACHER: granted('OWNED'),
      STUDENT: denied(),
    },
    // B9 finalization: POST /v1/questions/:id/revisions/:rev/submit has
    // existed since B8 — this tag was stale (never cleared when that route
    // shipped), caught while touching the rest of this state machine's own
    // tags below.
  },
  {
    id: 'questionBank.review',
    section: 'Question Bank',
    label: 'Review submitted questions',
    action: 'READ',
    grants: {
      SOFTWARE_ADMIN: denied(),
      SCHOOL_ADMIN: granted('SCHOOL'),
      MODERATOR: denied(),
      HOD: granted('DEPARTMENT'),
      TEACHER: denied(),
      STUDENT: denied(),
    },
    // B9: GET /v1/reviews/queue and GET /v1/reviews/questions/:id.
  },
  {
    id: 'questionBank.comment.view',
    section: 'Question Bank',
    label: 'Comment on question (derived split: view)',
    action: 'READ',
    grants: {
      SOFTWARE_ADMIN: denied(),
      SCHOOL_ADMIN: granted('SCHOOL'),
      MODERATOR: denied(),
      HOD: granted('DEPARTMENT'),
      TEACHER: granted('OWNED', 'Comments on their own submitted question.'),
      STUDENT: denied(),
    },
    // B9: GET /v1/reviews/history/:questionId.
  },
  {
    id: 'questionBank.comment.create',
    section: 'Question Bank',
    label: 'Comment on question (derived split: create)',
    action: 'CREATE',
    grants: {
      SOFTWARE_ADMIN: denied(),
      SCHOOL_ADMIN: denied(),
      MODERATOR: denied(),
      HOD: granted('DEPARTMENT'),
      TEACHER: granted(
        'OWNED',
        '"Respond to feedback" — replies on their own question\'s review thread, not an initiating review comment.',
      ),
      STUDENT: denied(),
    },
    // B9: the roadmap's own 6-endpoint question-review.v1 contract has no
    // standalone "add a comment" route — HOD's comment is always bundled
    // with a decision (POST .../approve|reject|request-changes' own
    // note/reason field), and a teacher's real "respond to feedback" is
    // resubmission via the existing createRevision()+submit() flow, not a
    // textual reply. This row's grants remain accurate policy, but neither
    // side is wired to a dedicated endpoint this phase — a standalone
    // reply-comment endpoint is recorded as Candidate/Deferred.
  },
  {
    id: 'questionBank.approve',
    section: 'Question Bank',
    label: 'Approve question',
    action: 'EXECUTE',
    grants: {
      SOFTWARE_ADMIN: denied(),
      SCHOOL_ADMIN: denied(),
      MODERATOR: denied(),
      HOD: granted('DEPARTMENT'),
      TEACHER: denied(),
      STUDENT: denied(),
    },
    // B9: POST /v1/reviews/questions/:id/approve. SOFTWARE_ADMIN is denied
    // outright, not breakGlass — ADR-0012 names question approval as one of
    // the few school-academic actions with no break-glass override at all.
  },
  {
    id: 'questionBank.reject',
    section: 'Question Bank',
    label: 'Reject question',
    action: 'EXECUTE',
    grants: {
      SOFTWARE_ADMIN: denied(),
      SCHOOL_ADMIN: denied(),
      MODERATOR: denied(),
      HOD: granted('DEPARTMENT'),
      TEACHER: denied(),
      STUDENT: denied(),
    },
    // B9: POST /v1/reviews/questions/:id/reject.
  },
  {
    id: 'questionBank.requestChanges',
    section: 'Question Bank',
    label: 'Request changes',
    action: 'EXECUTE',
    grants: {
      SOFTWARE_ADMIN: denied(),
      SCHOOL_ADMIN: denied(),
      MODERATOR: denied(),
      HOD: granted('DEPARTMENT'),
      TEACHER: denied(),
      STUDENT: denied(),
    },
    // B9: POST /v1/reviews/questions/:id/request-changes.
  },
  {
    id: 'questionBank.archive',
    section: 'Question Bank',
    label: 'Archive question',
    action: 'DELETE',
    grants: {
      SOFTWARE_ADMIN: breakGlass('R4: named explicitly in ADR-0012 as a break-glass example.'),
      // B8 finalization: real, unqualified SCHOOL-wide write access — the
      // same broad-oversight shape every other .manage-style row already
      // grants these two roles throughout this table, not merely a read
      // placeholder. Archiving is soft/reversible (never a hard delete),
      // so this is a low-risk, defensible finalization of "Limited" (02's
      // own matrix legend) rather than a guess.
      SCHOOL_ADMIN: granted('SCHOOL'),
      MODERATOR: granted('SCHOOL'),
      HOD: granted('DEPARTMENT'),
      TEACHER: granted('OWNED', '"Own/assigned" — an author may archive their own question.'),
      STUDENT: denied(),
    },
  },
  {
    id: 'questionBank.import',
    section: 'Question Bank',
    label: 'Import questions',
    action: 'CREATE',
    grants: {
      SOFTWARE_ADMIN: breakGlassWrite(),
      SCHOOL_ADMIN: limitedReadOnly(
        'SCHOOL',
        'B7/B8 — School Admin\'s import boundary is not yet finalized (this is a CREATE-shaped row; "Limited" is recorded here as a placeholder pending that phase, not a working read-only grant).',
      ),
      MODERATOR: granted('SCHOOL'),
      HOD: granted('DEPARTMENT'),
      TEACHER: granted('ASSIGNED'),
      STUDENT: denied(),
    },
  },
  {
    id: 'questionBank.export',
    section: 'Question Bank',
    label: 'Export questions',
    action: 'READ',
    grants: {
      SOFTWARE_ADMIN: platformRead(),
      SCHOOL_ADMIN: limitedReadOnly('SCHOOL', 'B8.'),
      MODERATOR: granted('SCHOOL'),
      HOD: granted('DEPARTMENT'),
      TEACHER: granted('ASSIGNED'),
      STUDENT: denied(),
    },
  },

  // ------------------------------------------------------------------
  // Question Lifecycle — these rows describe Question resource-state
  // visibility/action rights, not independent capabilities; several
  // duplicate a Question Bank row above by design (02 lists both).
  // ------------------------------------------------------------------
  {
    id: 'questionLifecycle.createDraft',
    section: 'Question Lifecycle',
    label: 'Create Draft',
    action: 'CREATE',
    grants: {
      SOFTWARE_ADMIN: denied(),
      SCHOOL_ADMIN: denied(),
      MODERATOR: denied(),
      HOD: denied(),
      TEACHER: granted(
        'ASSIGNED',
        'Duplicate of "Create question" — gated by subject/class assignment before the question exists to be OWNED.',
      ),
      STUDENT: denied(),
    },
  },
  {
    id: 'questionLifecycle.submit',
    section: 'Question Lifecycle',
    label: 'Submit',
    action: 'EXECUTE',
    grants: {
      SOFTWARE_ADMIN: denied(),
      SCHOOL_ADMIN: denied(),
      MODERATOR: denied(),
      HOD: denied(),
      TEACHER: granted('OWNED', 'Duplicate of "Submit question for review".'),
      STUDENT: denied(),
    },
    // B9 finalization: see questionBank.submitForReview's own note above —
    // the underlying route exists since B8; this duplicate row's tag was
    // equally stale.
  },
  {
    id: 'questionLifecycle.underReview',
    section: 'Question Lifecycle',
    label: 'Under Review (view)',
    action: 'READ',
    grants: {
      SOFTWARE_ADMIN: platformRead(),
      SCHOOL_ADMIN: granted('SCHOOL'),
      MODERATOR: granted('SCHOOL'),
      HOD: granted('DEPARTMENT'),
      TEACHER: granted('OWNED'),
      STUDENT: denied(),
    },
    // B9: the state machine is real, though no code path currently writes
    // UNDER_REVIEW itself (see QuestionRevisionStatus's own schema doc
    // comment) — a revision this view would show is presently always seen
    // as SUBMITTED instead. Reachable and correct the moment a future
    // change ever sets that status.
  },
  {
    id: 'questionLifecycle.approved',
    section: 'Question Lifecycle',
    label: 'Approved (view)',
    action: 'READ',
    grants: {
      SOFTWARE_ADMIN: platformRead(),
      SCHOOL_ADMIN: granted('SCHOOL'),
      MODERATOR: granted('SCHOOL'),
      HOD: granted('DEPARTMENT'),
      TEACHER: granted('OWNED'),
      STUDENT: denied(),
    },
    // B9: POST /v1/reviews/questions/:id/approve reaches this state for real.
  },
  {
    id: 'questionLifecycle.rejected.view',
    section: 'Question Lifecycle',
    label: 'Rejected (derived split: view)',
    action: 'READ',
    grants: {
      SOFTWARE_ADMIN: platformRead(),
      SCHOOL_ADMIN: granted('SCHOOL'),
      MODERATOR: granted('SCHOOL'),
      HOD: granted('DEPARTMENT'),
      TEACHER: granted('OWNED'),
      STUDENT: denied(),
    },
    // B9: reachable for real once a REJECTED revision exists.
  },
  {
    id: 'questionLifecycle.rejected.editResubmit',
    section: 'Question Lifecycle',
    label: 'Rejected (derived split: edit & resubmit)',
    action: 'UPDATE',
    grants: {
      SOFTWARE_ADMIN: denied(),
      SCHOOL_ADMIN: denied(),
      MODERATOR: denied(),
      HOD: denied(),
      TEACHER: granted(
        'OWNED',
        'Only while question.status = REJECTED — resource-state gate enforced by ' +
          "QuestionRevisionService.createRevision() (B8), reachable for real once B9's " +
          'review endpoints actually produce a REJECTED revision.',
      ),
      STUDENT: denied(),
    },
    // B9: the real state machine now produces REJECTED revisions (both
    // REJECTED and REQUEST_CHANGES decisions — see QuestionReview's own
    // schema doc comment).
  },
  {
    id: 'questionLifecycle.archived',
    section: 'Question Lifecycle',
    label: 'Archived (view)',
    action: 'READ',
    grants: {
      SOFTWARE_ADMIN: platformRead(),
      SCHOOL_ADMIN: granted('SCHOOL'),
      MODERATOR: granted('SCHOOL'),
      HOD: granted('DEPARTMENT'),
      TEACHER: granted('OWNED'),
      STUDENT: denied(),
    },
  },

  // ------------------------------------------------------------------
  // Exam Management
  // ------------------------------------------------------------------
  {
    id: 'exam.viewAll',
    section: 'Exam Management',
    label: 'View all exams',
    action: 'READ',
    grants: {
      SOFTWARE_ADMIN: platformRead(),
      SCHOOL_ADMIN: granted('SCHOOL'),
      MODERATOR: granted('SCHOOL'),
      HOD: granted('DEPARTMENT'),
      TEACHER: granted('ASSIGNED'),
      STUDENT: granted(
        'SELF',
        '"Available only" — ADR-0006\'s eligibility predicate; B12 wires the actual filter.',
      ),
    },
  },
  {
    id: 'exam.create',
    section: 'Exam Management',
    label: 'Create exam',
    action: 'CREATE',
    grants: {
      SOFTWARE_ADMIN: denied(),
      SCHOOL_ADMIN: denied(
        'R12/C-07: exam authoring is a Teacher capability; School Admin holds administration rights on existing exams instead.',
      ),
      MODERATOR: denied('R12/C-07.'),
      HOD: denied('R12/C-07.'),
      TEACHER: granted('ASSIGNED'),
      STUDENT: denied(),
    },
  },
  {
    id: 'exam.editDraft',
    section: 'Exam Management',
    label: 'Edit draft exam',
    action: 'UPDATE',
    grants: {
      SOFTWARE_ADMIN: denied(),
      SCHOOL_ADMIN: granted('SCHOOL'),
      MODERATOR: granted('SCHOOL'),
      HOD: granted('DEPARTMENT'),
      TEACHER: granted('OWNED'),
      STUDENT: denied(),
    },
  },
  {
    id: 'exam.deleteDraft',
    section: 'Exam Management',
    label: 'Delete draft exam',
    action: 'DELETE',
    grants: {
      SOFTWARE_ADMIN: denied(),
      SCHOOL_ADMIN: granted('SCHOOL'),
      MODERATOR: granted('SCHOOL'),
      HOD: granted('DEPARTMENT'),
      TEACHER: granted('OWNED'),
      STUDENT: denied(),
    },
  },
  {
    // B11 gap-closure: `02`'s own Exam Management matrix never lists a
    // "Cancel exam" row at all — roadmap DoD item 7 ("cancelling from
    // DRAFT or READY records a reason and is audited") is real, approved
    // scope with no permission id to attach to, mirroring the same shape
    // of small necessary addition B6/F7/B9 each made once building the
    // real consumer surfaced a gap the source matrix itself never
    // enumerated. Grant shape mirrors `exam.deleteDraft` exactly — its
    // closest conceptual sibling (an early-lifecycle, DRAFT/READY-only
    // administrative action) — rather than `exam.archive`'s: SOFTWARE_ADMIN
    // stays `denied()`, not break-glass, since "cancel exam" is not among
    // ADR-0012's named break-glass examples (R4's own conservative default:
    // only the specifically-named examples extend, nothing speculative).
    id: 'exam.cancel',
    section: 'Exam Management',
    label: 'Cancel exam',
    action: 'EXECUTE',
    grants: {
      SOFTWARE_ADMIN: denied(),
      SCHOOL_ADMIN: granted('SCHOOL'),
      MODERATOR: granted('SCHOOL'),
      HOD: granted('DEPARTMENT'),
      TEACHER: granted('OWNED'),
      STUDENT: denied(),
    },
  },
  {
    id: 'exam.addQuestions',
    section: 'Exam Management',
    label: 'Add questions to exam',
    action: 'CREATE',
    grants: {
      SOFTWARE_ADMIN: denied(),
      SCHOOL_ADMIN: granted('SCHOOL'),
      MODERATOR: granted('SCHOOL'),
      HOD: granted('DEPARTMENT'),
      TEACHER: granted('OWNED'),
      STUDENT: denied(),
    },
  },
  {
    id: 'exam.useApprovedQuestions',
    section: 'Exam Management',
    label: 'Use approved questions',
    action: 'READ',
    grants: {
      SOFTWARE_ADMIN: denied(),
      SCHOOL_ADMIN: granted('SCHOOL'),
      MODERATOR: granted('SCHOOL'),
      HOD: granted('DEPARTMENT'),
      TEACHER: granted('ASSIGNED'),
      STUDENT: denied(),
    },
  },
  {
    id: 'exam.configureAvailability',
    section: 'Exam Management',
    label: 'Schedule/configure availability',
    action: 'UPDATE',
    grants: {
      SOFTWARE_ADMIN: denied(),
      SCHOOL_ADMIN: granted('SCHOOL'),
      MODERATOR: granted('SCHOOL'),
      HOD: granted('DEPARTMENT'),
      TEACHER: granted('OWNED'),
      STUDENT: denied(),
    },
  },
  {
    id: 'exam.configureDuration',
    section: 'Exam Management',
    label: 'Configure duration',
    action: 'UPDATE',
    grants: {
      SOFTWARE_ADMIN: denied(),
      SCHOOL_ADMIN: granted('SCHOOL'),
      MODERATOR: granted('SCHOOL'),
      HOD: granted('DEPARTMENT'),
      TEACHER: granted('OWNED'),
      STUDENT: denied(),
    },
  },
  {
    id: 'exam.configureRandomization',
    section: 'Exam Management',
    label: 'Configure randomization',
    action: 'UPDATE',
    grants: {
      SOFTWARE_ADMIN: denied(),
      SCHOOL_ADMIN: granted('SCHOOL'),
      MODERATOR: granted('SCHOOL'),
      HOD: granted('DEPARTMENT'),
      TEACHER: granted('OWNED'),
      STUDENT: denied(),
    },
  },
  {
    id: 'exam.configureAttempts',
    section: 'Exam Management',
    label: 'Configure attempts',
    action: 'UPDATE',
    grants: {
      SOFTWARE_ADMIN: denied(),
      SCHOOL_ADMIN: granted('SCHOOL'),
      MODERATOR: granted('SCHOOL'),
      HOD: granted('DEPARTMENT'),
      TEACHER: granted('OWNED'),
      STUDENT: denied(),
    },
  },
  {
    id: 'exam.publish',
    section: 'Exam Management',
    label: 'Publish/activate exam',
    action: 'EXECUTE',
    grants: {
      SOFTWARE_ADMIN: denied(),
      SCHOOL_ADMIN: granted('SCHOOL'),
      MODERATOR: granted('SCHOOL'),
      HOD: granted('DEPARTMENT'),
      TEACHER: granted('OWNED'),
      STUDENT: denied(),
    },
  },
  {
    // B12: ADR-0009 — "Pause" and "Close new attempts" are the identical
    // OPEN→CLOSED transition (no separate PAUSED state exists). Rather than
    // double-checking two permission ids with structurally identical grants
    // at every close call site, `exam.closeNewAttempts` is checked as
    // representative of both — mirrors ExamConfigurationService's own B11
    // precedent of checking one of several identically-shaped rows as
    // representative of all. This row itself is never independently
    // evaluated by any B12 endpoint.
    id: 'exam.pause',
    section: 'Exam Management',
    label: 'Pause exam',
    action: 'EXECUTE',
    grants: {
      SOFTWARE_ADMIN: denied(),
      SCHOOL_ADMIN: granted('SCHOOL'),
      MODERATOR: granted('SCHOOL'),
      HOD: granted('DEPARTMENT'),
      TEACHER: granted('OWNED'),
      STUDENT: denied(),
    },
  },
  {
    // B12: gates both the exam-level close (POST /exams/:id/close, cascades
    // every OPEN session to CLOSED) and the session-level close
    // (POST /exam-sessions/:id/close) — see exam.pause's own comment above.
    id: 'exam.closeNewAttempts',
    section: 'Exam Management',
    label: 'Close new attempts',
    action: 'EXECUTE',
    grants: {
      SOFTWARE_ADMIN: denied(),
      SCHOOL_ADMIN: granted('SCHOOL'),
      MODERATOR: granted('SCHOOL'),
      HOD: granted('DEPARTMENT'),
      TEACHER: granted('OWNED'),
      STUDENT: denied(),
    },
  },
  {
    // B12: gates both the exam-level reopen (POST /exams/:id/reopen) and
    // the session-level reopen (POST /exam-sessions/:id/reopen).
    id: 'exam.reopen',
    section: 'Exam Management',
    label: 'Reopen exam',
    action: 'EXECUTE',
    grants: {
      SOFTWARE_ADMIN: denied(),
      SCHOOL_ADMIN: granted('SCHOOL'),
      MODERATOR: granted('SCHOOL'),
      HOD: granted('DEPARTMENT'),
      TEACHER: granted('OWNED'),
      STUDENT: denied(),
    },
  },
  {
    // B12 gap-closure: ADR-0012/M-15's ExamAdministrator delegation needs
    // some way to actually be created — no existing row fits "assign a
    // delegate" semantically. Grant shape copied verbatim from
    // exam.publish's, since only the exam's own owner or an equivalently-
    // scoped admin should be able to delegate operation of it. Confirmed
    // with the project owner during B12 planning (2026-09-04) as a small,
    // necessary addition beyond the roadmap's literal endpoint list.
    id: 'exam.manageAdministrators',
    section: 'Exam Management',
    label: 'Manage exam administrators',
    action: 'EXECUTE',
    grants: {
      SOFTWARE_ADMIN: denied(),
      SCHOOL_ADMIN: granted('SCHOOL'),
      MODERATOR: granted('SCHOOL'),
      HOD: granted('DEPARTMENT'),
      TEACHER: granted('OWNED'),
      STUDENT: denied(),
    },
  },
  {
    id: 'exam.archive',
    section: 'Exam Management',
    label: 'Archive exam',
    action: 'DELETE',
    grants: {
      SOFTWARE_ADMIN: breakGlass(
        'R4: matrix\'s literal "Full" read as break-glass per this file\'s header — consistent with "archive question" being explicitly named break-glass.',
      ),
      SCHOOL_ADMIN: granted('SCHOOL'),
      MODERATOR: granted('SCHOOL'),
      HOD: granted('DEPARTMENT'),
      TEACHER: granted('OWNED'),
      STUDENT: denied(),
    },
  },

  // ------------------------------------------------------------------
  // Exam Administration — "own exam" throughout means created_by OR an
  // active ExamAdministrator delegate (M-15/ADR-0012), wired into the
  // OWNED scope resolver by B12.
  // ------------------------------------------------------------------
  {
    id: 'examAdmin.controlCenter',
    section: 'Exam Administration',
    label: 'Exam Control Center',
    action: 'EXECUTE',
    grants: {
      SOFTWARE_ADMIN: breakGlass(
        "R4: operating a school's live Exam Control Center is a school-academic write surface; SA reads (viewing live status) are separately permitted+audited — see the view-* rows below.",
      ),
      SCHOOL_ADMIN: granted('SCHOOL'),
      MODERATOR: granted('SCHOOL'),
      HOD: granted('DEPARTMENT'),
      TEACHER: granted('OWNED'),
      STUDENT: denied(),
    },
  },
  {
    id: 'examAdmin.viewRegisteredStudents',
    section: 'Exam Administration',
    label: 'View registered students',
    action: 'READ',
    grants: {
      SOFTWARE_ADMIN: platformRead(),
      SCHOOL_ADMIN: granted('SCHOOL'),
      MODERATOR: granted('SCHOOL'),
      HOD: granted('DEPARTMENT'),
      TEACHER: granted('ASSIGNED'),
      STUDENT: denied(),
    },
  },
  {
    id: 'examAdmin.viewLiveAttempts',
    section: 'Exam Administration',
    label: 'View live attempts',
    action: 'READ',
    grants: {
      SOFTWARE_ADMIN: platformRead(),
      SCHOOL_ADMIN: granted('SCHOOL'),
      MODERATOR: granted('SCHOOL'),
      HOD: granted('DEPARTMENT'),
      TEACHER: granted('OWNED'),
      STUDENT: denied(),
    },
  },
  {
    id: 'examAdmin.seeStarted',
    section: 'Exam Administration',
    label: 'See who has started',
    action: 'READ',
    grants: {
      SOFTWARE_ADMIN: platformRead(),
      SCHOOL_ADMIN: granted('SCHOOL'),
      MODERATOR: granted('SCHOOL'),
      HOD: granted('DEPARTMENT'),
      TEACHER: granted('OWNED'),
      STUDENT: denied(),
    },
  },
  {
    id: 'examAdmin.seeCompleted',
    section: 'Exam Administration',
    label: 'See who has completed',
    action: 'READ',
    grants: {
      SOFTWARE_ADMIN: platformRead(),
      SCHOOL_ADMIN: granted('SCHOOL'),
      MODERATOR: granted('SCHOOL'),
      HOD: granted('DEPARTMENT'),
      TEACHER: granted('OWNED'),
      STUDENT: denied(),
    },
  },
  {
    // B12: also gates the inverse action (revoke, DELETE .../participants/
    // :studentId) — no separate revoke permission id exists.
    id: 'examAdmin.allowStudent',
    section: 'Exam Administration',
    label: 'Manually allow student',
    action: 'EXECUTE',
    grants: {
      SOFTWARE_ADMIN: breakGlassWrite(),
      SCHOOL_ADMIN: granted('SCHOOL'),
      MODERATOR: granted('SCHOOL'),
      HOD: granted('DEPARTMENT'),
      TEACHER: granted('OWNED'),
      STUDENT: denied(),
    },
  },
  {
    id: 'examAdmin.grantMakeup',
    section: 'Exam Administration',
    label: 'Grant makeup access',
    action: 'EXECUTE',
    grants: {
      SOFTWARE_ADMIN: breakGlass('R4: named explicitly in ADR-0012 as a break-glass example.'),
      SCHOOL_ADMIN: granted('SCHOOL'),
      MODERATOR: granted('SCHOOL'),
      HOD: granted('DEPARTMENT'),
      TEACHER: granted('OWNED'),
      STUDENT: denied(),
    },
    // B14 stale-tag correction (confirmed decision, this planning session):
    // ADR-0014 itself states "Blocks phases: B16", and its own Required-
    // changes list never names B14 — AttemptAuthorization/grantMakeup/
    // invalidateAttempt are deferred to B16, not built in B14.
    awaitingResource: 'AttemptAuthorization (B16, ADR-0014)',
  },
  {
    id: 'examAdmin.markAbsence',
    section: 'Exam Administration',
    label: 'Mark/confirm absence',
    action: 'EXECUTE',
    grants: {
      SOFTWARE_ADMIN: breakGlassWrite(),
      SCHOOL_ADMIN: granted('SCHOOL'),
      MODERATOR: granted('SCHOOL'),
      HOD: granted('DEPARTMENT'),
      TEACHER: granted('OWNED'),
      STUDENT: denied(),
    },
  },
  {
    id: 'examAdmin.endAttempt',
    section: 'Exam Administration',
    label: 'End individual attempt',
    action: 'EXECUTE',
    grants: {
      SOFTWARE_ADMIN: breakGlassWrite(),
      SCHOOL_ADMIN: granted('SCHOOL'),
      MODERATOR: granted('SCHOOL'),
      HOD: granted('DEPARTMENT'),
      TEACHER: granted('OWNED'),
      STUDENT: denied(),
    },
  },
  {
    // B13 (decision 2, confirmed this planning session): resolves the
    // ExamSessionParticipant.extraTimeSeconds accommodation gap — graded
    // identically to examAdmin.allowStudent's own shape, its closest
    // conceptual sibling (an administrative action on a specific student's
    // participation row).
    id: 'examAdmin.grantExtraTime',
    section: 'Exam Administration',
    label: 'Grant extra time (accommodation)',
    action: 'EXECUTE',
    grants: {
      SOFTWARE_ADMIN: breakGlassWrite(),
      SCHOOL_ADMIN: granted('SCHOOL'),
      MODERATOR: granted('SCHOOL'),
      HOD: granted('DEPARTMENT'),
      TEACHER: granted('OWNED'),
      STUDENT: denied(),
    },
  },
  {
    id: 'examAdmin.invalidateAttempt',
    section: 'Exam Administration',
    label: 'Invalidate attempt',
    action: 'EXECUTE',
    grants: {
      SOFTWARE_ADMIN: breakGlass('R4: named explicitly in ADR-0012 as a break-glass example.'),
      SCHOOL_ADMIN: granted('SCHOOL'),
      MODERATOR: granted('SCHOOL'),
      HOD: granted('DEPARTMENT'),
      TEACHER: deferred(
        '"Request/limited" names no actual mechanism in any document — not covered by ADR-0017 either. DENIED, fail-closed, pending explicit product clarification.',
      ),
      STUDENT: denied(),
    },
    // B14 stale-tag correction — see examAdmin.grantMakeup's own comment
    // immediately above for the full reasoning: deferred to B16, not B14.
    awaitingResource: 'ExamAttempt (B16, ADR-0014)',
  },

  // ------------------------------------------------------------------
  // Student CBT — "Login" itself is the auth.v1 contract (B1), not a
  // resource-permission row, and is intentionally not duplicated here.
  // ------------------------------------------------------------------
  {
    id: 'studentCbt.viewActiveAssessment',
    section: 'Student CBT',
    label: 'View active assessment',
    action: 'READ',
    grants: {
      SOFTWARE_ADMIN: denied(),
      SCHOOL_ADMIN: denied(),
      MODERATOR: denied(),
      HOD: denied(),
      TEACHER: denied(),
      STUDENT: granted('SELF'),
    },
  },
  {
    id: 'studentCbt.start',
    section: 'Student CBT',
    label: 'Start exam',
    action: 'EXECUTE',
    grants: {
      SOFTWARE_ADMIN: denied(),
      SCHOOL_ADMIN: denied(),
      MODERATOR: denied(),
      HOD: denied(),
      TEACHER: denied(),
      STUDENT: granted('SELF'),
    },
  },
  {
    id: 'studentCbt.answer',
    section: 'Student CBT',
    label: 'Answer questions',
    action: 'UPDATE',
    grants: {
      SOFTWARE_ADMIN: denied(),
      SCHOOL_ADMIN: denied(),
      MODERATOR: denied(),
      HOD: denied(),
      TEACHER: denied(),
      STUDENT: granted('SELF'),
    },
  },
  {
    id: 'studentCbt.navigate',
    section: 'Student CBT',
    label: 'Navigate questions',
    action: 'READ',
    grants: {
      SOFTWARE_ADMIN: denied(),
      SCHOOL_ADMIN: denied(),
      MODERATOR: denied(),
      HOD: denied(),
      TEACHER: denied(),
      STUDENT: granted('SELF'),
    },
  },
  {
    id: 'studentCbt.submit',
    section: 'Student CBT',
    label: 'Submit exam',
    action: 'EXECUTE',
    grants: {
      SOFTWARE_ADMIN: denied(),
      SCHOOL_ADMIN: denied(),
      MODERATOR: denied(),
      HOD: denied(),
      TEACHER: denied(),
      STUDENT: granted('SELF'),
    },
    // B13 fully implements the EXECUTE action (state transition + answer
    // freeze) — only marking (a distinct, later concern) is B14's, and
    // marking is not what this permission id gates.
  },
  {
    // B14: the ExamAttempt sweeper (ADR-0004) now exists — apps/worker's
    // BullMQ repeatable job as the authority, plus opportunistic
    // finalisation at every relevant apps/api touchpoint, both sharing one
    // idempotent, conditionally-guarded transition. awaitingResource
    // cleared; system() grants needed no scope resolver and were never
    // blocked on anything but the mechanism's existence.
    id: 'studentCbt.autoSubmit',
    section: 'Student CBT',
    label: 'Auto-submit on timeout',
    action: 'EXECUTE',
    grants: {
      SOFTWARE_ADMIN: system(),
      SCHOOL_ADMIN: system(),
      MODERATOR: system(),
      HOD: system(),
      TEACHER: system(),
      STUDENT: system(),
    },
  },
  {
    id: 'studentCbt.resume',
    section: 'Student CBT',
    label: 'Resume interrupted attempt',
    action: 'EXECUTE',
    grants: {
      SOFTWARE_ADMIN: denied(),
      SCHOOL_ADMIN: denied(),
      MODERATOR: denied(),
      HOD: denied(),
      TEACHER: denied(),
      STUDENT: granted('SELF'),
    },
  },
  {
    id: 'studentCbt.viewPreviousResults',
    section: 'Student CBT',
    label: 'View previous results',
    action: 'READ',
    grants: {
      SOFTWARE_ADMIN: denied(),
      SCHOOL_ADMIN: denied(),
      MODERATOR: denied(),
      HOD: denied(),
      TEACHER: denied(),
      STUDENT: granted(
        'SELF',
        '"Configurable" — gated by a school-level setting; B15/B17 wires it.',
      ),
    },
    awaitingResource: 'Result (B15), school setting (B17)',
  },

  // ------------------------------------------------------------------
  // Results
  // ------------------------------------------------------------------
  {
    // B14: the marking MECHANISM is now real (AttemptQuestionResult per
    // question, read from the frozen snapshot, idempotent/upsert-based).
    // awaitingResource narrowed rather than cleared — this row is named
    // after the `Result` entity, which still genuinely doesn't exist until
    // B15 (this phase's own confirmed decision: B14 stays entity-free for
    // `Result` — see AttemptQuestionResult's own schema doc comment).
    id: 'results.automaticMarking',
    section: 'Results',
    label: 'Automatic marking',
    action: 'EXECUTE',
    grants: {
      SOFTWARE_ADMIN: system(),
      SCHOOL_ADMIN: system(),
      MODERATOR: system(),
      HOD: system(),
      TEACHER: system(),
      STUDENT: denied(),
    },
    awaitingResource: 'Result (B15)',
  },
  {
    id: 'results.viewExamResults',
    section: 'Results',
    label: 'View exam results',
    action: 'READ',
    grants: {
      SOFTWARE_ADMIN: platformRead(),
      SCHOOL_ADMIN: granted('SCHOOL'),
      MODERATOR: granted('SCHOOL'),
      HOD: granted('DEPARTMENT'),
      TEACHER: granted('OWNED'),
      STUDENT: granted(
        'SELF',
        '"Own published results" — gated by ResultPublication (ADR-0010); B17 wires the publication-state check.',
      ),
    },
    awaitingResource: 'Result (B15)',
  },
  {
    id: 'results.viewIndividualResult',
    section: 'Results',
    label: 'View individual student result',
    action: 'READ',
    grants: {
      SOFTWARE_ADMIN: platformRead(),
      SCHOOL_ADMIN: granted('SCHOOL'),
      MODERATOR: granted('SCHOOL'),
      HOD: granted('DEPARTMENT'),
      TEACHER: granted('ASSIGNED'),
      STUDENT: granted('SELF'),
    },
    awaitingResource: 'Result (B15)',
  },
  {
    id: 'results.viewClassPerformance',
    section: 'Results',
    label: 'View class performance',
    action: 'READ',
    grants: {
      SOFTWARE_ADMIN: platformRead(),
      SCHOOL_ADMIN: granted('SCHOOL'),
      MODERATOR: granted('SCHOOL'),
      HOD: granted('DEPARTMENT'),
      TEACHER: granted('ASSIGNED'),
      STUDENT: denied(),
    },
    awaitingResource: 'Result (B16/B17 analytics)',
  },
  {
    id: 'results.viewSubjectPerformance',
    section: 'Results',
    label: 'View subject performance',
    action: 'READ',
    grants: {
      SOFTWARE_ADMIN: platformRead(),
      SCHOOL_ADMIN: granted('SCHOOL'),
      MODERATOR: granted('DEPARTMENT'),
      HOD: granted('DEPARTMENT'),
      TEACHER: granted('ASSIGNED', '"Own subjects".'),
      STUDENT: denied(),
    },
    awaitingResource: 'Result (B16/B17 analytics)',
  },
  {
    id: 'results.viewQuestionPerformance',
    section: 'Results',
    label: 'View question performance',
    action: 'READ',
    grants: {
      SOFTWARE_ADMIN: platformRead(),
      SCHOOL_ADMIN: granted('SCHOOL'),
      MODERATOR: granted('DEPARTMENT'),
      HOD: granted('DEPARTMENT'),
      TEACHER: granted('OWNED', '"Own exams".'),
      STUDENT: denied(),
    },
    awaitingResource: 'Result/Question analytics (B16/B17)',
  },
  {
    id: 'results.exportCsv',
    section: 'Results',
    label: 'Export CSV',
    action: 'READ',
    grants: {
      SOFTWARE_ADMIN: platformRead(),
      SCHOOL_ADMIN: granted('SCHOOL'),
      MODERATOR: granted('SCHOOL'),
      HOD: granted('DEPARTMENT'),
      TEACHER: granted('OWNED'),
      STUDENT: denied(),
    },
    awaitingResource: 'Result (B15)',
  },
  {
    id: 'results.publish',
    section: 'Results',
    label: 'Publish results',
    action: 'EXECUTE',
    grants: {
      SOFTWARE_ADMIN: denied(),
      SCHOOL_ADMIN: granted('SCHOOL'),
      MODERATOR: granted('SCHOOL'),
      HOD: granted('DEPARTMENT'),
      TEACHER: granted('OWNED'),
      STUDENT: denied(),
    },
    awaitingResource: 'ResultPublication (B15/B17, ADR-0010)',
  },
  {
    id: 'results.unpublish',
    section: 'Results',
    label: 'Unpublish results',
    action: 'EXECUTE',
    grants: {
      SOFTWARE_ADMIN: denied(),
      SCHOOL_ADMIN: granted('SCHOOL'),
      MODERATOR: granted('SCHOOL'),
      HOD: granted('DEPARTMENT'),
      TEACHER: granted('OWNED'),
      STUDENT: denied(),
    },
    awaitingResource: 'ResultPublication (B15/B17, ADR-0010)',
  },

  // ------------------------------------------------------------------
  // Analytics
  // ------------------------------------------------------------------
  {
    id: 'analytics.platform',
    section: 'Analytics',
    label: 'Platform analytics',
    action: 'READ',
    grants: {
      SOFTWARE_ADMIN: granted('PLATFORM'),
      SCHOOL_ADMIN: denied(),
      MODERATOR: denied(),
      HOD: denied(),
      TEACHER: denied(),
      STUDENT: denied(),
    },
    awaitingResource: 'Platform metrics (B3)',
  },
  {
    id: 'analytics.schoolWide',
    section: 'Analytics',
    label: 'School-wide analytics',
    action: 'READ',
    grants: {
      SOFTWARE_ADMIN: platformRead(),
      SCHOOL_ADMIN: granted('SCHOOL'),
      MODERATOR: granted('SCHOOL'),
      HOD: denied(),
      TEACHER: denied(),
      STUDENT: denied(),
    },
    awaitingResource: 'B16/B17 analytics',
  },
  {
    id: 'analytics.department',
    section: 'Analytics',
    label: 'Department analytics',
    action: 'READ',
    grants: {
      SOFTWARE_ADMIN: platformRead(),
      SCHOOL_ADMIN: granted('SCHOOL'),
      MODERATOR: limitedReadOnly(
        'DEPARTMENT',
        'Exact "Limited" department-analytics subset for Moderator finalized in B19.',
      ),
      HOD: granted('DEPARTMENT'),
      TEACHER: denied(),
      STUDENT: denied(),
    },
    awaitingResource: 'B16/B17 analytics',
  },
  {
    id: 'analytics.class',
    section: 'Analytics',
    label: 'Class analytics',
    action: 'READ',
    grants: {
      SOFTWARE_ADMIN: platformRead(),
      SCHOOL_ADMIN: granted('SCHOOL'),
      MODERATOR: granted('SCHOOL'),
      HOD: granted('DEPARTMENT'),
      TEACHER: granted('ASSIGNED'),
      STUDENT: denied(),
    },
    awaitingResource: 'B16/B17 analytics',
  },
  {
    id: 'analytics.studentHistory',
    section: 'Analytics',
    label: 'Student performance history',
    action: 'READ',
    grants: {
      SOFTWARE_ADMIN: platformRead(),
      SCHOOL_ADMIN: granted('SCHOOL'),
      MODERATOR: granted('SCHOOL'),
      HOD: granted('DEPARTMENT'),
      TEACHER: granted('ASSIGNED'),
      STUDENT: granted('SELF'),
    },
    awaitingResource: 'Result (B15), B16/B17 analytics',
  },
  {
    id: 'analytics.questionDifficulty',
    section: 'Analytics',
    label: 'Question difficulty analysis',
    action: 'READ',
    grants: {
      SOFTWARE_ADMIN: platformRead(),
      SCHOOL_ADMIN: granted('SCHOOL'),
      MODERATOR: granted('DEPARTMENT'),
      HOD: granted('DEPARTMENT'),
      TEACHER: granted('OWNED'),
      STUDENT: denied(),
    },
    awaitingResource: 'Question/Result analytics (B16/B17)',
  },
  {
    id: 'analytics.examCompletionStats',
    section: 'Analytics',
    label: 'Exam completion statistics',
    action: 'READ',
    grants: {
      SOFTWARE_ADMIN: platformRead(),
      SCHOOL_ADMIN: granted('SCHOOL'),
      MODERATOR: granted('SCHOOL'),
      HOD: granted('DEPARTMENT'),
      TEACHER: granted('OWNED'),
      STUDENT: denied(),
    },
    awaitingResource: 'ExamParticipation analytics (B16/B17)',
  },

  // ------------------------------------------------------------------
  // Reporting / Export
  // ------------------------------------------------------------------
  {
    id: 'reporting.exportSchoolData',
    section: 'Reporting / Export',
    label: 'Export school data',
    action: 'READ',
    grants: {
      SOFTWARE_ADMIN: platformRead(),
      SCHOOL_ADMIN: granted('SCHOOL'),
      MODERATOR: granted('SCHOOL'),
      HOD: granted('DEPARTMENT'),
      TEACHER: granted('ASSIGNED'),
      STUDENT: denied(),
    },
    awaitingResource: 'B18 reporting',
  },
  {
    id: 'reporting.exportExamResults',
    section: 'Reporting / Export',
    label: 'Export exam results',
    action: 'READ',
    grants: {
      SOFTWARE_ADMIN: platformRead(),
      SCHOOL_ADMIN: granted('SCHOOL'),
      MODERATOR: granted('SCHOOL'),
      HOD: granted('DEPARTMENT'),
      TEACHER: granted('OWNED'),
      STUDENT: denied(),
    },
    awaitingResource: 'Result (B15), B18 reporting',
  },
  {
    id: 'reporting.exportStudentList',
    section: 'Reporting / Export',
    label: 'Export student list',
    action: 'READ',
    grants: {
      SOFTWARE_ADMIN: platformRead(),
      SCHOOL_ADMIN: granted('SCHOOL'),
      MODERATOR: granted('SCHOOL'),
      HOD: granted('DEPARTMENT'),
      TEACHER: granted('ASSIGNED'),
      STUDENT: denied(),
    },
    awaitingResource: 'B18 reporting',
  },
  {
    id: 'reporting.exportQuestionBank',
    section: 'Reporting / Export',
    label: 'Export question bank',
    action: 'READ',
    grants: {
      SOFTWARE_ADMIN: platformRead(),
      SCHOOL_ADMIN: limitedReadOnly('SCHOOL', 'B8.'),
      MODERATOR: granted('SCHOOL'),
      HOD: granted('DEPARTMENT'),
      TEACHER: granted('ASSIGNED', '"Own subjects".'),
      STUDENT: denied(),
    },
    awaitingResource: 'Question (B8), B18 reporting',
  },
  {
    id: 'reporting.generatePrintableReports',
    section: 'Reporting / Export',
    label: 'Generate printable reports',
    action: 'READ',
    grants: {
      SOFTWARE_ADMIN: platformRead(),
      SCHOOL_ADMIN: granted('SCHOOL'),
      MODERATOR: granted('SCHOOL'),
      HOD: granted('DEPARTMENT'),
      TEACHER: granted('OWNED'),
      STUDENT: granted(
        'SELF',
        '"if enabled" — school-setting gated, same family as studentCbt.viewPreviousResults.',
      ),
    },
    awaitingResource:
      'ADR-0030 defers server-rendered PDF reporting to a later phase; B18 gains the rendering pipeline.',
  },

  // ------------------------------------------------------------------
  // Academic Progression
  // ------------------------------------------------------------------
  {
    id: 'progression.promote.view',
    section: 'Academic Progression',
    label: 'Promote students (derived split: view)',
    action: 'READ',
    grants: {
      SOFTWARE_ADMIN: platformRead(),
      SCHOOL_ADMIN: granted('SCHOOL'),
      MODERATOR: granted('SCHOOL'),
      HOD: granted('DEPARTMENT'),
      TEACHER: denied(),
      STUDENT: denied(),
    },
    awaitingResource: 'Promotion workflow (B19)',
  },
  {
    id: 'progression.promote.execute',
    section: 'Academic Progression',
    label: 'Promote students (derived split: execute)',
    action: 'EXECUTE',
    grants: {
      SOFTWARE_ADMIN: breakGlassWrite(),
      SCHOOL_ADMIN: granted('SCHOOL'),
      MODERATOR: granted('SCHOOL'),
      HOD: denied(),
      TEACHER: denied(),
      STUDENT: denied(),
    },
    awaitingResource: 'Promotion workflow (B19)',
  },
  {
    id: 'progression.reviewPromotionList',
    section: 'Academic Progression',
    label: 'Review promotion list',
    action: 'READ',
    grants: {
      SOFTWARE_ADMIN: platformRead(),
      SCHOOL_ADMIN: granted('SCHOOL'),
      MODERATOR: granted('SCHOOL'),
      HOD: granted('DEPARTMENT'),
      TEACHER: denied(),
      STUDENT: denied(),
    },
    awaitingResource: 'Promotion workflow (B19)',
  },
  {
    id: 'progression.moveStudentToNextSession',
    section: 'Academic Progression',
    label: 'Move student to next session',
    action: 'EXECUTE',
    grants: {
      SOFTWARE_ADMIN: breakGlassWrite(),
      SCHOOL_ADMIN: granted('SCHOOL'),
      MODERATOR: granted('SCHOOL'),
      HOD: denied(),
      TEACHER: denied(),
      STUDENT: denied(),
    },
    awaitingResource: 'Promotion workflow (B19)',
  },
  {
    id: 'progression.graduateArchiveStudents',
    section: 'Academic Progression',
    label: 'Graduate/archive students',
    action: 'EXECUTE',
    grants: {
      SOFTWARE_ADMIN: breakGlassWrite(),
      SCHOOL_ADMIN: granted('SCHOOL'),
      MODERATOR: granted('SCHOOL'),
      HOD: denied(),
      TEACHER: denied(),
      STUDENT: denied(),
    },
    awaitingResource: 'Promotion workflow (B19)',
  },

  // ------------------------------------------------------------------
  // Subscription
  // ------------------------------------------------------------------
  {
    id: 'subscription.view',
    section: 'Subscription',
    label: 'View subscription',
    action: 'READ',
    grants: {
      SOFTWARE_ADMIN: granted('PLATFORM'),
      SCHOOL_ADMIN: granted('SCHOOL'),
      MODERATOR: granted('SCHOOL'),
      HOD: denied(),
      TEACHER: denied(),
      STUDENT: denied(),
    },
    awaitingResource: 'Subscription (B3)',
  },
  {
    id: 'subscription.enterActivationKey',
    section: 'Subscription',
    label: 'Enter activation key',
    action: 'EXECUTE',
    grants: {
      SOFTWARE_ADMIN: denied(),
      SCHOOL_ADMIN: granted('SCHOOL'),
      MODERATOR: deferred(
        '"Authorized" — Moderator may redeem only when explicitly delegated by School Admin; the delegation mechanism is unspecified anywhere and left to B3\'s activation-flow design.',
      ),
      HOD: denied(),
      TEACHER: denied(),
      STUDENT: denied(),
    },
    awaitingResource: 'ActivationGrant (B3)',
  },
  {
    id: 'subscription.renewAccess',
    section: 'Subscription',
    label: 'Renew access',
    action: 'EXECUTE',
    grants: {
      SOFTWARE_ADMIN: granted('PLATFORM'),
      SCHOOL_ADMIN: granted(
        'SCHOOL',
        '"Request/enter key" — School Admin may request renewal or redeem a key directly; B3 differentiates the two flows.',
      ),
      MODERATOR: denied(),
      HOD: denied(),
      TEACHER: denied(),
      STUDENT: denied(),
    },
    awaitingResource: 'Subscription/ActivationGrant (B3)',
  },
  {
    id: 'subscription.suspendAccess',
    section: 'Subscription',
    label: 'Suspend access',
    action: 'EXECUTE',
    grants: {
      SOFTWARE_ADMIN: granted('PLATFORM'),
      SCHOOL_ADMIN: denied(),
      MODERATOR: denied(),
      HOD: denied(),
      TEACHER: denied(),
      STUDENT: denied(),
    },
    awaitingResource: 'Subscription (B3)',
  },

  // ------------------------------------------------------------------
  // Audit / Security
  // ------------------------------------------------------------------
  {
    id: 'audit.viewLog',
    section: 'Audit / Security',
    label: 'View audit log',
    action: 'READ',
    grants: {
      // Presently unreachable in practice: GET /v1/audit's @Authorized(...)
      // guard is AuthGuard (school session only), and Software Admin never
      // has one. Implemented for correctness (pre-existing since B2), not
      // fixed here — Software Admin's real audit access is
      // platform.audit.view / GET /v1/platform/audit instead.
      SOFTWARE_ADMIN: platformRead(),
      SCHOOL_ADMIN: granted('SCHOOL'),
      // B10 finalization: converted from limitedReadOnly — GET /v1/audit
      // shipped with a plain, unqualified SCHOOL-wide read for Moderator
      // (matching this row's own 02 matrix cell, "Full"), the same
      // "confirm the real, final boundary and drop the placeholder wrapper"
      // precedent as questionBank.archive (B8).
      MODERATOR: granted('SCHOOL'),
      HOD: granted('DEPARTMENT'),
      TEACHER: granted('SELF', '"Own actions".'),
      STUDENT: granted('SELF', '"Own account".'),
    },
  },
  {
    id: 'notification.viewOwn',
    section: 'Audit / Security',
    label: 'View own notifications — not a literal 02 matrix row.',
    action: 'READ',
    grants: {
      SOFTWARE_ADMIN: granted('SELF'),
      SCHOOL_ADMIN: granted('SELF'),
      MODERATOR: granted('SELF'),
      HOD: granted('SELF'),
      TEACHER: granted('SELF'),
      STUDENT: granted('SELF'),
    },
  },
  {
    id: 'notification.markRead',
    section: 'Audit / Security',
    label: 'Mark own notification(s) read — not a literal 02 matrix row.',
    action: 'UPDATE',
    grants: {
      SOFTWARE_ADMIN: granted('SELF'),
      SCHOOL_ADMIN: granted('SELF'),
      MODERATOR: granted('SELF'),
      HOD: granted('SELF'),
      TEACHER: granted('SELF'),
      STUDENT: granted('SELF'),
    },
  },
  {
    id: 'account.resetOwnPassword',
    section: 'Audit / Security',
    label: 'Reset own password',
    action: 'EXECUTE',
    grants: {
      SOFTWARE_ADMIN: granted('SELF'),
      SCHOOL_ADMIN: granted('SELF'),
      MODERATOR: granted('SELF'),
      HOD: granted('SELF'),
      TEACHER: granted('SELF'),
      STUDENT: granted('SELF'),
    },
  },
  {
    id: 'account.changeOwnProfile',
    section: 'Audit / Security',
    label: 'Change own profile',
    action: 'UPDATE',
    grants: {
      SOFTWARE_ADMIN: granted('SELF'),
      SCHOOL_ADMIN: granted('SELF'),
      MODERATOR: granted('SELF'),
      HOD: granted('SELF'),
      TEACHER: granted('SELF'),
      STUDENT: granted('SELF'),
    },
    awaitingResource:
      'No profile-edit endpoint yet (future phase); identity read already exists (auth/me).',
  },
  {
    id: 'account.forcePasswordReset',
    section: 'Audit / Security',
    label: 'Force password reset',
    action: 'EXECUTE',
    grants: {
      SOFTWARE_ADMIN: breakGlass('R4: named explicitly in ADR-0012 as a break-glass example.'),
      SCHOOL_ADMIN: granted('SCHOOL'),
      MODERATOR: granted('SCHOOL'),
      // B6 finalized this call: HOD gets no real write access to
      // force-password-reset in this release — consistent with every other
      // B6 Security bullet (Moderator/School Admin only manage people) and
      // ADR-0017's general withdrawal of HOD operational authority over
      // people/assignments. Stays read-only per R5 — no controller route
      // grants HOD an actual reset-credential write path.
      HOD: limitedReadOnly(
        'DEPARTMENT',
        '"Limited" — HOD has no real write access to this action (B6 finalized: consistent with ADR-0017). Recorded as read-only per R5 — the row is EXECUTE-shaped, but no controller route grants HOD real write access.',
      ),
      TEACHER: denied(),
      STUDENT: denied(),
    },
  },
  {
    id: 'account.deactivate',
    section: 'Audit / Security',
    label: 'Deactivate account',
    action: 'UPDATE',
    grants: {
      SOFTWARE_ADMIN: breakGlass('R4: named explicitly in ADR-0012 as a break-glass example.'),
      SCHOOL_ADMIN: granted('SCHOOL'),
      MODERATOR: granted('SCHOOL'),
      HOD: denied(),
      TEACHER: denied(),
      STUDENT: denied(),
    },
  },
] as const;

export function findPermissionRule(id: string): PermissionRule | undefined {
  return PERMISSION_TABLE.find((rule) => rule.id === id);
}

export function requirePermissionRule(id: string): PermissionRule {
  const rule = findPermissionRule(id);
  if (!rule) {
    throw new Error(`Unknown permission rule id "${id}" — not declared in PERMISSION_TABLE.`);
  }
  return rule;
}
