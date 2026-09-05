import { apiClient, unwrap } from '@/lib/api';
import type { ApiComponents } from '@atlas/contracts';
import { getAttemptDb, type AnswerRow, type QuestionRow } from './db';
import { getDeviceId } from './device-id';
import { buildMediaManifestFromPackage, downloadAllMedia } from './media-cache';

type AttemptPackage = ApiComponents['schemas']['AttemptPackageResponseDto'];

export interface ReconciledAttempt {
  package: AttemptPackage;
  isRunning: boolean;
}

/**
 * F13 — one algorithm covering first entry, browser refresh, and crash-
 * reopen (DoD 6, 9, 10, 11). Always re-enters via a fresh `GET /attempts/:id`
 * first: server state is the entry point, never local Dexie alone — this is
 * what makes crash-recovery and reconnect-refresh the *same* code path
 * rather than two separately-tested branches.
 */
export async function reconcileAttemptOnLoad(attemptId: string): Promise<ReconciledAttempt> {
  const response = await unwrap(
    apiClient.GET('/attempts/{id}', {
      params: { path: { id: attemptId } },
      headers: { 'X-Device-Id': getDeviceId() },
    }),
  );

  const isRunning = response.state === 'IN_PROGRESS';
  if (!isRunning) {
    // Terminal/submitted — the caller renders the matching screen with no
    // lock, engine, or timer; nothing further to reconcile locally.
    return { package: response, isRunning };
  }

  const db = getAttemptDb();
  const clockSkewMs = Date.parse(response.serverTime) - Date.now();
  const now = new Date().toISOString();

  await db.transaction('rw', [db.attemptPackages, db.questions, db.answers], async () => {
    await db.attemptPackages.put({
      attemptId: response.attemptId,
      examId: response.examId,
      examSessionId: response.examSessionId,
      state: response.state,
      startedAt: response.startedAt,
      expiresAt: response.expiresAt,
      navigationPolicy: response.navigationPolicy,
      generalInstructions: response.generalInstructions ?? null,
      navigationInstructions: response.navigationInstructions ?? null,
      clockSkewMs,
      deviceId: getDeviceId(),
      lastResumedAt: now,
    });

    for (const question of response.questions) {
      const questionRow: QuestionRow = {
        attemptId,
        examQuestionId: question.examQuestionId,
        displaySequence: question.displaySequence,
        marks: question.marks,
        questionType: question.questionType,
        content: question.content,
        options: question.options.map((option) => ({
          optionId: option.optionId,
          content: option.content,
          displayPosition: option.displayPosition,
        })),
        media: question.media.map((media) => ({
          mediaAssetId: media.mediaAssetId,
          displayOrder: media.displayOrder,
          mediaType: media.mediaType,
        })),
      };
      await db.questions.put(questionRow);

      const existing = await db.answers.get([attemptId, question.examQuestionId]);
      const serverSequence = question.answerSequenceNumber ?? 0;
      const serverSelected = question.selectedOptionId ?? null;

      const shouldKeepLocal = existing !== undefined && existing.localSequence > serverSequence;
      const row: AnswerRow = shouldKeepLocal
        ? {
            ...existing,
            // A crash/refresh mid-flight, not a stale write — the sync
            // engine's next flush resends it; if the server already
            // received it moments before the interruption, the resend is a
            // harmless idempotent no-op (ATTEMPT_ANSWER_SEQUENCE_STALE's
            // discard path). A `'window-closed'` row is preserved exactly
            // as-is instead — that state is terminal by design (ADR-0003),
            // never resent.
            syncStatus: existing.syncStatus === 'window-closed' ? 'window-closed' : 'pending',
          }
        : {
            attemptId,
            examQuestionId: question.examQuestionId,
            selectedOptionId: serverSelected,
            localSequence: serverSequence,
            syncStatus: 'synced',
            lastServerSequence: serverSequence,
            lastSyncedAt: now,
            lastAttemptedAt: null,
            rejectionCode: null,
            acknowledged: false,
            updatedAt: now,
          };
      await db.answers.put(row);
    }
  });

  await buildMediaManifestFromPackage(
    attemptId,
    response.questions.map((question) => ({
      examQuestionId: question.examQuestionId,
      media: question.media,
    })),
  );
  // Best-effort background re-fetch of anything not already validly cached
  // — this is also the only re-sign mechanism for expiring signed URLs (see
  // media-cache.ts's own documented limitation). Never blocks the runtime:
  // an already-running exam doesn't re-gate on the download-progress screen
  // the way the initial Start flow does.
  if (typeof navigator === 'undefined' || navigator.onLine) {
    void downloadAllMedia(attemptId, () => undefined);
  }

  return { package: response, isRunning };
}
