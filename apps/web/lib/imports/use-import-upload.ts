'use client';

import { useState } from 'react';
import {
  useCompleteImportUpload,
  useRequestImportUpload,
  type ImportUploadKind,
} from './mutations';

export interface ImportUploadResult {
  mediaAssetId: string;
}

/**
 * The same 3-call sequence `useLogoUpload` (B4/F4/F5) established —
 * `upload-target` → raw `PUT` of the file bytes → `complete` — structurally
 * copied here rather than generalised into one shared cross-phase hook,
 * matching this codebase's "each phase owns its own thin wrapper" precedent
 * for very small, non-generic sequences. Returns only `{ mediaAssetId }`: an
 * import CSV/xlsx has no meaningful visual preview the way a logo image does.
 */
export function useImportUpload(kind: ImportUploadKind) {
  const requestUpload = useRequestImportUpload(kind);
  const completeUpload = useCompleteImportUpload(kind);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function upload(file: File): Promise<ImportUploadResult | null> {
    setError(null);
    setUploading(true);
    try {
      const target = await requestUpload.mutateAsync({
        filename: file.name,
        declaredMimeType: file.type,
        declaredSizeBytes: file.size,
      });
      const putRes = await fetch(target.uploadUrl, { method: 'PUT', body: file });
      if (!putRes.ok) throw new Error('Upload failed');
      const completed = await completeUpload.mutateAsync(target.mediaAssetId);
      if (completed.status === 'REJECTED') {
        setError(completed.rejectionReason ?? 'This file could not be used.');
        return null;
      }
      return { mediaAssetId: completed.id };
    } catch {
      setError('Could not upload the file. Please try again.');
      return null;
    } finally {
      setUploading(false);
    }
  }

  return { upload, uploading, error };
}
