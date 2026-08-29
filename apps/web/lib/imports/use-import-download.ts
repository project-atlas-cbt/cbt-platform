'use client';

import { useMutation } from '@tanstack/react-query';
import { API_VERSION_PREFIX } from '@atlas/contracts';
import { resolveApiOrigin, toApiError } from '@/lib/api';
import type { ImportJobType } from './queries';

const FALLBACK_API_ORIGIN = process.env.NEXT_PUBLIC_API_ORIGIN ?? 'http://localhost:3001';
const API_PORT = process.env.NEXT_PUBLIC_API_PORT ?? '3001';

function currentOrigin(): string {
  return typeof window !== 'undefined'
    ? resolveApiOrigin(
        window.location.hostname,
        window.location.protocol,
        FALLBACK_API_ORIGIN,
        API_PORT,
      )
    : FALLBACK_API_ORIGIN;
}

/**
 * `apiClient` is JSON-typed throughout and unsuited to a raw `text/csv`
 * response, exactly the reason `useClassCredentialSheet` (F7,
 * `lib/people/mutations.ts`) already uses a manual `fetch` instead — this is
 * a structural copy of that same pattern for the two `imports.v1` CSV
 * routes. Unlike that route, both of these are `GET`s: `csrfMiddleware`
 * only ever attaches `X-CSRF-Token` to a mutating request, so no CSRF header
 * is needed here (mirrors `apiClient`'s own GET/HEAD exemption).
 */
export async function downloadCsv(
  url: string,
  filename: string,
  fallbackMessage: string,
): Promise<void> {
  const res = await fetch(url, { credentials: 'include' });

  if (!res.ok) {
    let body: unknown;
    try {
      body = await res.json();
    } catch {
      body = undefined;
    }
    throw toApiError(body, res.status, fallbackMessage);
  }

  const blob = await res.blob();
  const downloadUrl = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = downloadUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(downloadUrl);
}

/** DoD item 1 — the versioned CSV template for a given import type. */
export function useDownloadImportTemplate() {
  return useMutation({
    mutationFn: (type: ImportJobType) => {
      const lower = type.toLowerCase();
      const url = `${currentOrigin()}${API_VERSION_PREFIX}/imports/templates/${lower}`;
      return downloadCsv(url, `${lower}-template.csv`, 'Could not download the template.');
    },
  });
}

/** DoD item 5 — every invalid/failed row as a correctable, re-uploadable CSV. */
export function useDownloadImportErrors() {
  return useMutation({
    mutationFn: (jobId: string) => {
      const url = `${currentOrigin()}${API_VERSION_PREFIX}/imports/${jobId}/errors`;
      return downloadCsv(url, 'import-errors.csv', 'Could not download the error file.');
    },
  });
}
