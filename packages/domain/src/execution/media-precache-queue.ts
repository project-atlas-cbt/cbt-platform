/**
 * F20 — the encrypted media pre-cache job (ADR-0021 amendment). Producer and
 * consumer both live in `apps/api`: encrypting needs object storage, which
 * stays behind the API's own storage abstraction (the B18 export worker's
 * precedent). Deliberately NOT paused by B21's load shedding — a lab cannot
 * start until its paper's media is cached, so this is exam preparation, not
 * reporting.
 */
export const EXAM_MEDIA_PRECACHE_QUEUE_NAME = 'atlas-exam-media-precache';

export interface ExamMediaPrecacheJobPayload {
  schoolId: string;
  examId: string;
}
