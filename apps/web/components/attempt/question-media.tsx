'use client';

import { ImageOff } from 'lucide-react';
import { useMediaAssetUrl } from '@/lib/attempt/media-cache';

/**
 * F13 — ADR-0021's offline-aware media renderer (DoD 18). Resolves the
 * asset from the local cache/manifest, never directly from a raw signed
 * URL that could be expired or unreachable offline (`useMediaAssetUrl`).
 *
 * Confirmed decision (2026-09-05): a missing/evicted asset while offline
 * never blocks answering — it renders this honest placeholder instead, and
 * the question stays fully answerable.
 */
export function QuestionMedia({
  attemptId,
  mediaAssetId,
  mediaType,
}: {
  attemptId: string;
  mediaAssetId: string;
  mediaType: string;
}) {
  const { status, src } = useMediaAssetUrl(attemptId, mediaAssetId);

  if (status === 'loading') {
    return (
      <div className="h-40 w-full max-w-md animate-pulse rounded-md bg-surface-muted" aria-hidden />
    );
  }

  if (status === 'unavailable' || !src) {
    return (
      <div
        role="status"
        className="flex h-40 w-full max-w-md flex-col items-center justify-center gap-2 rounded-md border border-dashed border-border bg-surface-muted text-center"
      >
        <ImageOff className="size-6 text-text-muted" aria-hidden />
        <p className="max-w-[220px] text-xs text-text-muted">
          This image isn&apos;t available offline right now. You can still answer this question — it
          will be available again once you&apos;re reconnected.
        </p>
      </div>
    );
  }

  if (mediaType.startsWith('AUDIO')) {
    return <audio controls src={src} className="w-full max-w-md" />;
  }

  // A plain <img>, not next/image: `src` may be a `blob:` object URL when
  // served from the offline cache, which next/image's optimizer cannot
  // process (this codebase has no eslint rule enforcing next/image either
  // — see eslint.config.mjs's own note on Next-specific rules being F0's
  // deferred scope, not yet added).
  return (
    <img
      src={src}
      alt="Question illustration"
      className="max-w-md rounded-md border border-border"
    />
  );
}
