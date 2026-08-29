'use client';

import { useState } from 'react';
import {
  useAttachQuestionMedia,
  useCompleteQuestionMediaUpload,
  useRequestQuestionMediaUpload,
} from './mutations';

export interface QuestionMediaUploadResult {
  mediaAssetId: string;
  previewUrl: string;
}

/**
 * F9 — a structural copy of `lib/branding/use-logo-upload.ts`'s 3-call
 * sequence (`upload-target` → raw `PUT` → `complete`), plus a 4th call the
 * logo flow doesn't need: attaching the finished asset to a specific draft
 * revision (`POST .../media`). Requires a real `revisionId` — the caller
 * (`MediaUploader`) disables itself until one exists, since a draft
 * revision must already have been created (see the editor's create-then-
 * patch design) before any media can be attached to it.
 */
export function useQuestionMediaUpload(
  questionId: string | undefined,
  revisionId: string | undefined,
) {
  const requestUpload = useRequestQuestionMediaUpload();
  const completeUpload = useCompleteQuestionMediaUpload();
  const attachMedia = useAttachQuestionMedia(questionId ?? '', revisionId ?? '');
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function upload(
    file: File,
    context: {
      type: 'QUESTION_IMAGE' | 'QUESTION_DIAGRAM';
      subjectId: string;
      level: 'JSS1' | 'JSS2' | 'JSS3' | 'SS1' | 'SS2' | 'SS3';
      displayOrder: number;
    },
  ): Promise<QuestionMediaUploadResult | null> {
    if (!questionId || !revisionId) {
      setError('Save the question as a draft before attaching media.');
      return null;
    }
    setError(null);
    setUploading(true);
    try {
      const target = await requestUpload.mutateAsync({
        type: context.type,
        filename: file.name,
        declaredMimeType: file.type,
        declaredSizeBytes: file.size,
        subjectId: context.subjectId,
        level: context.level,
      });
      const putRes = await fetch(target.uploadUrl, { method: 'PUT', body: file });
      if (!putRes.ok) throw new Error('Upload failed');
      const completed = await completeUpload.mutateAsync(target.mediaAssetId);
      if (completed.status === 'REJECTED') {
        setError(completed.rejectionReason ?? 'This file could not be used.');
        return null;
      }
      await attachMedia.mutateAsync({
        mediaAssetId: completed.id,
        displayOrder: context.displayOrder,
      });
      return { mediaAssetId: completed.id, previewUrl: URL.createObjectURL(file) };
    } catch {
      setError('Could not upload this file. Please try a different one.');
      return null;
    } finally {
      setUploading(false);
    }
  }

  return { upload, uploading, error };
}
