import { Module } from '@nestjs/common';

/**
 * Bounded domain per 08 §5: "Exams — Exams, sections, exam-question
 * bindings, readiness and configuration." Populated by B11 (builder &
 * readiness — ADR-0002, ADR-0013, ADR-0029) and B12 (activation & control
 * — ADR-0006, ADR-0009, ADR-0020).
 *
 * Deliberately empty in B0 — module boundary stubbed, no domain logic.
 */
@Module({})
export class ExamsModule {}
