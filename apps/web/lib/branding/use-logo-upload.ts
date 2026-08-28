'use client';

import { useState } from 'react';
import { useCompleteLogoUpload, useRequestLogoUpload } from './mutations';

export interface LogoUploadResult {
  mediaAssetId: string;
  previewUrl: string;
}

/**
 * The real 3-call logo upload sequence (`upload-target` → raw `PUT` of the
 * file bytes → `complete`) — B4's own design, since the browser must PUT
 * directly to the signed URL. Extracted from F4's `Step02Branding` so F5's
 * School Settings Branding screen doesn't reimplement it.
 */
export function useLogoUpload() {
  const requestUpload = useRequestLogoUpload();
  const completeUpload = useCompleteLogoUpload();
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function upload(file: File): Promise<LogoUploadResult | null> {
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
        setError(completed.rejectionReason ?? 'This file could not be used as a logo.');
        return null;
      }
      return { mediaAssetId: completed.id, previewUrl: URL.createObjectURL(file) };
    } catch {
      setError('Could not upload the logo. Please try a different file.');
      return null;
    } finally {
      setUploading(false);
    }
  }

  return { upload, uploading, error };
}
