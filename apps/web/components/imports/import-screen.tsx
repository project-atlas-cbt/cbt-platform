'use client';

import Link from 'next/link';
import { ArrowLeft, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { useHasPermission } from '@/lib/nav';
import { useDownloadImportTemplate } from '@/lib/imports/use-import-download';
import type { ImportJobType } from '@/lib/imports/queries';
import { BulkImportFlow } from './bulk-import-flow';

export interface ImportScreenProps {
  type: ImportJobType;
  /** The permission id this route's own backend routes are gated by —
   * checked client-side purely as a usability affordance (hide what the
   * actor can't do), never as the real security boundary. */
  permission: string;
  title: string;
  backHref: string;
  backLabel: string;
}

/**
 * The one shared per-route wrapper every F8 screen mounts: heading,
 * back-link to the directory, a `useHasPermission` gate, the always-visible
 * template download (DoD item 1), and `<BulkImportFlow>` itself.
 */
export function ImportScreen({ type, permission, title, backHref, backLabel }: ImportScreenProps) {
  const canImport = useHasPermission(permission);
  const downloadTemplate = useDownloadImportTemplate();

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <Link
            href={backHref}
            className="inline-flex items-center gap-1 text-sm text-text-secondary hover:text-text-primary"
          >
            <ArrowLeft className="size-3.5" aria-hidden /> {backLabel}
          </Link>
          <h2 className="text-base font-semibold text-text-primary">{title}</h2>
        </div>
        <Button
          variant="secondary"
          loading={downloadTemplate.isPending}
          onClick={() => downloadTemplate.mutate(type)}
        >
          <Download aria-hidden /> Download template
        </Button>
      </div>

      {canImport ? (
        <BulkImportFlow type={type} goToDirectoryHref={backHref} />
      ) : (
        <EmptyState
          title="You don't have access to this"
          description="Importing requires additional permissions. Contact your School Admin."
        />
      )}
    </div>
  );
}
