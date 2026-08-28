import { Module } from '@nestjs/common';
import { IdentityModule } from '../identity/identity.module.js';
import { OperationsModule } from '../operations/operations.module.js';
import { AcademicsContextController } from './academics-context.controller.js';
import { AcademicsContextService } from './academics-context.service.js';
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
import { SubjectController } from './subject.controller.js';
import { SubjectService } from './subject.service.js';
import { TermController } from './term.controller.js';
import { TermService } from './term.service.js';

/**
 * Bounded domain per 08 §5: "Academics — Sessions, terms, departments,
 * classes, subjects, enrollments, assignments." B5 populates the
 * session-scoped structural half (AcademicSession, AcademicTerm,
 * Department, ClassGroup, Subject, ClassSubject, HODAssignment) — B6 adds
 * StudentEnrollment/TeacherAssignment/StudentSubjectRegistration on top of
 * this same module.
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
  ],
})
export class AcademicsModule {}
