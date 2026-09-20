import { Module } from '@nestjs/common';
import { IdentityModule } from '../identity/identity.module.js';
import { OperationsModule } from '../operations/operations.module.js';
import { AcademicsContextController } from './academics-context.controller.js';
import { AcademicsContextService } from './academics-context.service.js';
import { AssignedScopeResolverProvider } from './assigned-scope-resolver.provider.js';
import { AcademicsAuditActionRegistrationProvider } from './audit-action-registration.provider.js';
import { ClassCredentialSheetController } from './class-credential-sheet.controller.js';
import { ClassCredentialSheetService } from './class-credential-sheet.service.js';
import { ClassGroupController } from './class-group.controller.js';
import { ClassGroupService } from './class-group.service.js';
import { ClassSubjectController } from './class-subject.controller.js';
import { ClassSubjectService } from './class-subject.service.js';
import { DepartmentController } from './department.controller.js';
import { DepartmentService } from './department.service.js';
import { DepartmentScopeResolverProvider } from './department-scope-resolver.provider.js';
import { HodAssignmentController } from './hod-assignment.controller.js';
import { HodAssignmentService } from './hod-assignment.service.js';
import { SessionController } from './session.controller.js';
import { SessionService } from './session.service.js';
import { StudentEnrollmentController } from './student-enrollment.controller.js';
import { StudentEnrollmentService } from './student-enrollment.service.js';
import { StudentSubjectRegistrationController } from './student-subject-registration.controller.js';
import { StudentSubjectRegistrationService } from './student-subject-registration.service.js';
import { SubjectController } from './subject.controller.js';
import { SubjectService } from './subject.service.js';
import { TeacherAssignmentController } from './teacher-assignment.controller.js';
import { TeacherAssignmentService } from './teacher-assignment.service.js';
import { TermController } from './term.controller.js';
import { TermService } from './term.service.js';
import { RolloverController } from './rollover.controller.js';
import { RolloverService } from './rollover.service.js';

/**
 * Bounded domain per 08 §5: "Academics — Sessions, terms, departments,
 * classes, subjects, enrollments, assignments." B5 populates the
 * session-scoped structural half (AcademicSession, AcademicTerm,
 * Department, ClassGroup, Subject, ClassSubject, HODAssignment); B6 adds
 * StudentEnrollment/TeacherAssignment/StudentSubjectRegistration on top of
 * this same module, exactly as this comment already anticipated.
 *
 * Imports IdentityModule for the same reason every other `@Authorized`-
 * using module does (platform.module.ts's own precedent): `AuthGuard`'s
 * constructor dependencies (SessionService) are only exported from there,
 * and a guard class's DI graph resolves from the *consuming* module's
 * injector, not just wherever the AuthorizationModule global happens to
 * live. OperationsModule for AuditService (every mutation is audited).
 * ScopeResolverRegistry/AuthorizationService/PermissionGuard are already
 * globally available via the @Global() AuthorizationModule — not imported
 * again here.
 */
@Module({
  imports: [IdentityModule, OperationsModule],
  controllers: [
    AcademicsContextController,
    SessionController,
    TermController,
    DepartmentController,
    ClassGroupController,
    SubjectController,
    ClassSubjectController,
    HodAssignmentController,
    StudentEnrollmentController,
    TeacherAssignmentController,
    StudentSubjectRegistrationController,
    ClassCredentialSheetController,
    RolloverController,
  ],
  providers: [
    AcademicsContextService,
    SessionService,
    TermService,
    DepartmentService,
    ClassGroupService,
    SubjectService,
    ClassSubjectService,
    HodAssignmentService,
    DepartmentScopeResolverProvider,
    StudentEnrollmentService,
    TeacherAssignmentService,
    StudentSubjectRegistrationService,
    AssignedScopeResolverProvider,
    ClassCredentialSheetService,
    AcademicsAuditActionRegistrationProvider,
    RolloverService,
  ],
  // B6: HodAssignmentService is this module's first-ever export — UsersModule's
  // HodController calls .reassign() for PUT /v1/hods/:id/department. One-
  // directional (AcademicsModule needs nothing back from UsersModule), so
  // no cycle.
  //
  // F4: AcademicsContextService/ClassGroupService are exported so
  // PlatformModule's SchoolOnboardingService can reuse their existing
  // session/class lookups for POST /v1/school/onboarding/complete's
  // fundamentals check, rather than duplicating those queries. Still
  // one-directional — PlatformModule importing AcademicsModule introduces
  // no cycle, since AcademicsModule has no dependency back on it.
  //
  // B7: StudentEnrollmentService is exported so ImportsModule's commit job
  // can call the real .enroll() (ADR-0011 auto-registration included)
  // rather than reimplementing it — same one-directional shape, no cycle.
  exports: [
    HodAssignmentService,
    AcademicsContextService,
    ClassGroupService,
    StudentEnrollmentService,
  ],
})
export class AcademicsModule {}
