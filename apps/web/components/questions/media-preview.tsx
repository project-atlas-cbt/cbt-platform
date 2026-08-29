'use client';

import { ImageOff } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { useMediaUrl } from '@/lib/questions/queries';

/** F9 — resolves a `QuestionMedia` item's short-lived signed URL
 * (`GET /media/{id}/url`, B4) and renders it, used by both `MediaUploader`
 * (attached-media list) and `QuestionDetailScreen` (read-only view). */
export function MediaPreview({ mediaAssetId, alt }: { mediaAssetId: string; alt: string }) {
  const media = useMediaUrl(mediaAssetId);

  if (media.isPending) return <Skeleton className="aspect-video w-full rounded-md" />;
  if (media.isError || !media.data) {
    return (
      <div className="flex aspect-video w-full items-center justify-center rounded-md border border-dashed border-border bg-surface-muted text-text-muted">
        <ImageOff className="size-6" aria-hidden />
      </div>
    );
  }
  // A plain <img>, not next/image: a short-lived signed URL, not an
  // app-owned static asset next/image can optimise — same reasoning as
  // `tenant-brand-line.tsx`/`branding-preview.tsx`.
  return (
    <img src={media.data.url} alt={alt} className="aspect-video w-full rounded-md object-cover" />
  );
}
