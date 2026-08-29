'use client';

import { useEffect, useRef, useState } from 'react';
import { ImagePlus, Loader2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useDetachQuestionMedia } from '@/lib/questions/mutations';
import { useQuestionMediaUpload } from '@/lib/questions/use-question-media-upload';
import { MediaPreview } from './media-preview';

export interface QuestionMediaItem {
  id: string;
  mediaAssetId: string;
  mediaType: string;
  displayOrder: number;
}

/**
 * F9 — `MediaUploader`: single-image-at-a-time attach/detach against a
 * draft revision. Disabled until a real revision exists (media attach
 * requires `:revisionId` — `Question`/`QuestionRevision` must already be
 * created), matching the editor's own create-then-patch design. Media size
 * guidance is surfaced here per F9's own CBT/offline consideration (`R-06`
 * — media cached into the client at attempt start, F13's contract).
 */
export function MediaUploader({
  questionId,
  revisionId,
  subjectId,
  level,
  media,
  disabled,
}: {
  questionId: string | undefined;
  revisionId: string | undefined;
  subjectId: string | undefined;
  level: 'JSS1' | 'JSS2' | 'JSS3' | 'SS1' | 'SS2' | 'SS3' | undefined;
  media: QuestionMediaItem[];
  disabled?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [type, setType] = useState<'QUESTION_IMAGE' | 'QUESTION_DIAGRAM'>('QUESTION_IMAGE');
  const { upload, uploading, error } = useQuestionMediaUpload(questionId, revisionId);
  const detachMedia = useDetachQuestionMedia(questionId ?? '', revisionId ?? '');

  // `media.length` alone races on back-to-back uploads: the prop only
  // reflects the server's real count once the attach mutation's query
  // invalidation has refetched, which can lag behind the "Attach media"
  // button re-enabling. This ref reserves the next slot synchronously, the
  // instant an upload starts, so a second upload started before that
  // refetch lands still gets a distinct `displayOrder` — and re-syncs to
  // the real count whenever the prop does change, so it never drifts from
  // the server's own truth for long.
  const mediaCountRef = useRef(media.length);
  useEffect(() => {
    mediaCountRef.current = media.length;
  }, [media.length]);

  const ready = Boolean(questionId && revisionId && subjectId && level);

  async function handleFile(file: File) {
    if (!subjectId || !level) return;
    const displayOrder = mediaCountRef.current;
    mediaCountRef.current += 1;
    const result = await upload(file, { type, subjectId, level, displayOrder });
    if (!result) {
      // The reservation didn't pan out (upload/attach failed) — release it
      // rather than permanently skip a display-order number, but never go
      // below the last confirmed server count.
      mediaCountRef.current = Math.max(mediaCountRef.current - 1, media.length);
    }
    if (inputRef.current) inputRef.current.value = '';
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Select
          value={type}
          disabled={disabled || uploading}
          onValueChange={(value) => setType(value as typeof type)}
        >
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="QUESTION_IMAGE">Image</SelectItem>
            <SelectItem value="QUESTION_DIAGRAM">Diagram</SelectItem>
          </SelectContent>
        </Select>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          disabled={disabled || !ready || uploading}
          onClick={() => inputRef.current?.click()}
        >
          {uploading ? <Loader2 className="animate-spin" aria-hidden /> : <ImagePlus aria-hidden />}
          Attach media
        </Button>
        <input
          ref={inputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="sr-only"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void handleFile(file);
          }}
        />
      </div>

      {!ready ? (
        <p className="text-sm text-text-muted">
          Save this question as a draft before attaching images or diagrams.
        </p>
      ) : (
        <p className="text-sm text-text-muted">
          PNG, JPEG, or WebP. Keep files small — every attachment is downloaded to a student&rsquo;s
          device before their attempt starts.
        </p>
      )}

      {error ? (
        <p role="alert" className="text-sm font-medium text-danger">
          {error}
        </p>
      ) : null}

      {media.length > 0 ? (
        <ul className="grid grid-cols-3 gap-3">
          {media.map((item) => (
            <li key={item.id} className="relative space-y-1">
              <MediaPreview
                mediaAssetId={item.mediaAssetId}
                alt={item.mediaType === 'QUESTION_DIAGRAM' ? 'Attached diagram' : 'Attached image'}
              />
              <div className="flex items-center justify-between text-sm">
                <span className="text-text-secondary">
                  {item.mediaType === 'QUESTION_DIAGRAM' ? 'Diagram' : 'Image'}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  disabled={disabled}
                  onClick={() => void detachMedia.mutateAsync(item.id)}
                  aria-label="Remove attachment"
                >
                  <X className="size-4" aria-hidden />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
