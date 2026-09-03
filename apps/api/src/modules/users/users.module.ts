import { Module } from '@nestjs/common';
import { AcademicsModule } from '../academics/academics.module.js';
import { IdentityModule } from '../identity/identity.module.js';
import { OperationsModule } from '../operations/operations.module.js';
import { HodController } from './hod.controller.js';
import { HodService } from './hod.service.js';
import { ModeratorController } from './moderator.controller.js';
import { ModeratorService } from './moderator.service.js';
import { StudentController } from './student.controller.js';
import { StudentService } from './student.service.js';
import { TeacherController } from './teacher.controller.js';
import { TeacherService } from './teacher.service.js';
import { UsersAuditActionRegistrationProvider } from './audit-action-registration.provider.js';

/**
 * `people.v1` (B6, docs/roadmaps/backend-roadmap.md). Person directories/
 * lifecycle — Student, Teacher, HOD, Moderator — operating on the B1
 * identity models (User/SchoolMembership/RoleAssignment/StudentProfile/
 * TeacherProfile). `StudentEnrollment`/`TeacherAssignment`/
 * `StudentSubjectRegistration` live in `AcademicsModule` instead, per that
 * module's own doc comment anticipating exactly this split.
 *
 * Imports `IdentityModule` for the same reason every `@Authorized`-using
 * module does (AuthGuard's own DI chain needs SessionService, exported
 * there) plus `PasswordService`/`CredentialSheetService`/`IdentityService`
 * (staff invitation dispatch, student credential-sheet issuance).
 * `OperationsModule` for `AuditService`. `AcademicsModule` one-directionally
 * for `HodAssignmentService` (HOD department (re)assignment) — no cycle,
 * `AcademicsModule` needs nothing back from this module.
 */
@Module({
  imports: [IdentityModule, OperationsModule, AcademicsModule],
  controllers: [StudentController, TeacherController, HodController, ModeratorController],
  providers: [
    StudentService,
    TeacherService,
    HodService,
    ModeratorService,
    UsersAuditActionRegistrationProvider,
  ],
})
export class UsersModule {}
