import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma, prisma, withTenant } from '@atlas/db';
import type { Env } from '@atlas/config';
import { AppHttpException } from '../../../common/app-http-exception.js';
import { ObjectStorageService } from '../../../storage/object-storage.service.js';
import { AuthorizationService } from '../../authorization/authorization.service.js';
import type { AuthorizedActor } from '../../authorization/authorization.types.js';
import { requireSchoolActor } from '../../questions/question-scope.util.js';
import type { MediaManifestResponseDto } from '../dto/attempt.dto.js';
import { ExamMediaPrecacheQueueService } from './exam-media-precache-queue.service.js';
import {
  DEV_FALLBACK_MEDIA_PRECACHE_SECRET,
  ciphertextStorageKey,
  deriveExamMediaKey,
  encryptMedia,
  sha256Hex,
} from './precache-crypto.js';

/** Signed ciphertext URLs need only outlive one pre-cache download pass;
 * the same ceiling ADR-0021 set for attempt-start media. */
const CIPHERTEXT_DOWNLOAD_TTL_SECONDS = 15 * 60;
/** Suggested client poll interval while encryption is still running. */
const NOT_READY_RETRY_AFTER_SECONDS = 5;

interface ExamMediaAsset {
  id: string;
  storageKey: string;
}

/**
 * F20 — encrypted media pre-cache (owner decision 2026-10-03; ADR-0021
 * amendment; `precache-crypto.ts` has the cryptographic design).
 *
 * A lab downloads the paper's media *before* the exam window, encrypted
 * under a per-exam key; the key reaches a student only inside their own
 * attempt package at Start (`AttemptLifecycleService`). This closes the
 * capacity plan's §9 failure (a media-heavy paper on a 2 Mbit lab link
 * cannot cache within the 60 s burst budget) without exposing any question
 * media before a student's own timer starts.
 */
@Injectable()
export class ExamMediaPrecacheService {
  private readonly logger = new Logger(ExamMediaPrecacheService.name);

  constructor(
    private readonly config: ConfigService<Env, true>,
    private readonly storage: ObjectStorageService,
    private readonly authz: AuthorizationService,
    private readonly queue: ExamMediaPrecacheQueueService,
  ) {}

  private secret(): string {
    return (
      this.config.get('MEDIA_PRECACHE_SECRET', { infer: true }) ??
      DEV_FALLBACK_MEDIA_PRECACHE_SECRET
    );
  }

  /** Base64 per-exam key — returned only inside the owner's attempt package. */
  mediaKeyFor(schoolId: string, examId: string): string {
    return deriveExamMediaKey(this.secret(), schoolId, examId).toString('base64');
  }

  /** Every READY media asset the exam's fixed question revisions reference,
   * deduplicated (an asset may be attached to several questions). The same
   * set the attempt snapshot will carry — pools are deferred (ADR-0002). */
  async examMediaAssets(schoolId: string, examId: string): Promise<ExamMediaAsset[]> {
    const rows = await withTenant(prisma, schoolId, (tx) =>
      tx.questionMedia.findMany({
        where: {
          schoolId,
          revision: { schoolId, examQuestions: { some: { schoolId, examId } } },
          mediaAsset: { schoolId, status: 'READY' },
        },
        select: { mediaAsset: { select: { id: true, storageKey: true } } },
      }),
    );
    const byId = new Map<string, ExamMediaAsset>();
    for (const row of rows) byId.set(row.mediaAsset.id, row.mediaAsset);
    return [...byId.values()].sort((a, b) => a.id.localeCompare(b.id));
  }

  /** Queue consumer: encrypts any asset that has no ciphertext yet.
   * Idempotent — approved revisions are immutable, so an existing copy is
   * never stale, and a concurrent duplicate insert is simply ignored. */
  async encryptExam(schoolId: string, examId: string): Promise<{ encrypted: number }> {
    const assets = await this.examMediaAssets(schoolId, examId);
    if (assets.length === 0) return { encrypted: 0 };
    const existing = await withTenant(prisma, schoolId, (tx) =>
      tx.examMediaCiphertext.findMany({
        where: { schoolId, examId },
        select: { mediaAssetId: true },
      }),
    );
    const done = new Set(existing.map((r) => r.mediaAssetId));
    const key = deriveExamMediaKey(this.secret(), schoolId, examId);

    let encrypted = 0;
    for (const asset of assets) {
      if (done.has(asset.id)) continue;
      const plaintext = await this.storage.getObject(asset.storageKey);
      const blob = encryptMedia(key, plaintext);
      const storageKey = ciphertextStorageKey(schoolId, examId, asset.id);
      await this.storage.putObject({
        storageKey,
        contentType: 'application/octet-stream',
        body: blob,
        contentLength: blob.length,
      });
      try {
        await withTenant(prisma, schoolId, (tx) =>
          tx.examMediaCiphertext.create({
            data: {
              schoolId,
              examId,
              mediaAssetId: asset.id,
              storageKey,
              byteSize: blob.length,
              sha256: sha256Hex(blob),
            },
          }),
        );
        encrypted += 1;
      } catch (error) {
        // A concurrent job won the race for this asset — its row (and the
        // object it describes, same key) stands.
        if (!(error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')) {
          throw error;
        }
      }
    }
    if (encrypted > 0) this.logger.log(`Encrypted ${encrypted} media asset(s) for exam ${examId}`);
    return { encrypted };
  }

  /**
   * Ciphertext is operational, not academic, data: once an exam can no
   * longer admit a new attempt (COMPLETED, ARCHIVED or CANCELLED — CLOSED
   * may still reopen), every attempt that will ever run already holds the
   * key and its own decrypted copy, so the copies are deleted (object, then
   * row). The plaintext MediaAsset remains the record of what was shown.
   * Bounded per school per pass; tenant-safe (withTenant per school).
   */
  async purgeFinishedExams(perSchool = 200): Promise<{ purged: number }> {
    const schools = await prisma.school.findMany({ select: { id: true } });
    let purged = 0;
    for (const { id: schoolId } of schools) {
      const rows = await withTenant(prisma, schoolId, (tx) =>
        tx.examMediaCiphertext.findMany({
          where: {
            schoolId,
            exam: { schoolId, status: { in: ['COMPLETED', 'ARCHIVED', 'CANCELLED'] } },
          },
          select: { id: true, storageKey: true },
          take: perSchool,
        }),
      );
      for (const row of rows) {
        await this.storage.deleteObject(row.storageKey);
        await withTenant(prisma, schoolId, (tx) =>
          tx.examMediaCiphertext.delete({ where: { id: row.id } }),
        );
        purged += 1;
      }
    }
    return { purged };
  }

  /** Best-effort: callers (session open) must never fail on a queue blip —
   * the manifest endpoint enqueues again lazily. */
  async requestEncryption(schoolId: string, examId: string): Promise<void> {
    try {
      await this.queue.enqueue({ schoolId, examId });
    } catch (error) {
      this.logger.warn(
        `Could not enqueue media pre-cache for exam ${examId}: ${(error as Error).message}`,
      );
    }
  }

  /**
   * `GET /v1/student/assessment/:examId/media-manifest`. Only for a student
   * who is an AUTHORIZED participant of an OPEN session of this OPEN exam —
   * the same predicate `GET /student/assessment` uses to offer the exam at
   * all. Never carries the key.
   */
  async getManifest(
    schoolId: string,
    actor: AuthorizedActor,
    examId: string,
  ): Promise<MediaManifestResponseDto> {
    const decision = await this.authz.evaluate(actor, 'studentCbt.viewActiveAssessment', {
      schoolId,
      ownerUserId: actor.userId,
      examId,
    });
    if (!decision.allowed) {
      throw new AppHttpException({
        code: 'FORBIDDEN',
        message: 'You do not have permission to prepare this exam.',
      });
    }
    const schoolActor = requireSchoolActor(actor);
    const participant = await withTenant(prisma, schoolId, (tx) =>
      tx.examSessionParticipant.findFirst({
        where: {
          schoolId,
          status: 'AUTHORIZED',
          studentProfile: { schoolId, membershipId: schoolActor.membershipId },
          session: { schoolId, status: 'OPEN', examId, exam: { schoolId, status: 'OPEN' } },
        },
        select: { id: true },
      }),
    );
    if (!participant) {
      // Indistinguishable from a nonexistent exam (B20 IDOR posture).
      throw new AppHttpException({
        code: 'NOT_FOUND',
        message: 'This assessment is not available to you right now.',
      });
    }

    const assets = await this.examMediaAssets(schoolId, examId);
    if (assets.length === 0) {
      return { ready: true, totalBytes: 0, retryAfterSeconds: null, assets: [] };
    }
    const ciphertexts = await withTenant(prisma, schoolId, (tx) =>
      tx.examMediaCiphertext.findMany({
        where: { schoolId, examId, mediaAssetId: { in: assets.map((a) => a.id) } },
        select: { mediaAssetId: true, storageKey: true, byteSize: true, sha256: true },
        orderBy: { mediaAssetId: 'asc' },
      }),
    );
    if (ciphertexts.length < assets.length) {
      await this.requestEncryption(schoolId, examId);
      return {
        ready: false,
        totalBytes: 0,
        retryAfterSeconds: NOT_READY_RETRY_AFTER_SECONDS,
        assets: [],
      };
    }

    const signed = await Promise.all(
      ciphertexts.map(async (c) => {
        const url = await this.storage.createSignedDownloadUrl(
          c.storageKey,
          CIPHERTEXT_DOWNLOAD_TTL_SECONDS,
          { contentType: 'application/octet-stream', disposition: 'attachment' },
        );
        return {
          mediaAssetId: c.mediaAssetId,
          url: url.url,
          expiresAt: url.expiresAt.toISOString(),
          byteSize: c.byteSize,
          sha256: c.sha256,
        };
      }),
    );
    return {
      ready: true,
      totalBytes: signed.reduce((sum, a) => sum + a.byteSize, 0),
      retryAfterSeconds: null,
      assets: signed,
    };
  }
}
