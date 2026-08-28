'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient, unwrap } from '@/lib/api';

/**
 * Shared branding write-side data layer (extracted from F4's
 * `lib/onboarding/mutations.ts` for F5's School Settings Branding screen —
 * these three hooks have no onboarding-specific behaviour, so they moved
 * rather than being duplicated). `useUpdateBranding` also invalidates
 * `['tenant', 'resolve']`, not just `['school', 'branding']` — this is what
 * makes a colour/logo change repaint `<ThemeProvider>` app-wide immediately
 * (F5 DoD item 3), not only within whichever screen made the change.
 */

export function useRequestLogoUpload() {
  return useMutation({
    mutationFn: (body: { filename: string; declaredMimeType: string; declaredSizeBytes: number }) =>
      unwrap(apiClient.POST('/school/branding/logo/upload-target', { body })),
  });
}

export function useCompleteLogoUpload() {
  return useMutation({
    mutationFn: (mediaAssetId: string) =>
      unwrap(
        apiClient.POST('/school/branding/logo/upload-target/{id}/complete', {
          params: { path: { id: mediaAssetId } },
        }),
      ),
  });
}

export function useUpdateBranding() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: { logoMediaId?: string | null; primaryColor?: string | null }) =>
      unwrap(apiClient.PUT('/school/branding', { body })),
    onSuccess: () =>
      Promise.all([
        client.invalidateQueries({ queryKey: ['school', 'branding'] }),
        client.invalidateQueries({ queryKey: ['tenant', 'resolve'] }),
      ]),
  });
}
