import { Module } from '@nestjs/common';

/**
 * Bounded domain per 08 §5: "Academics — Sessions, terms, departments,
 * classes, subjects, enrollments, assignments." Populated by B5 (academic
 * structure — ADR-0001, ADR-0013) and B6 (people/profiles/enrollment —
 * ADR-0011).
 *
 * Deliberately empty in B0 — module boundary stubbed, no domain logic.
 */
@Module({})
export class AcademicsModule {}
