'use client';

import { useCallback, useId, useRef, useState } from 'react';
import { Upload } from 'lucide-react';
import { cn } from '@/lib/utils';

const ACCEPTED_EXTENSIONS = ['.csv', '.xlsx'];
/** Mirrors the backend's own `IMPORT_SOURCE` content limit
 * (`content-validation.ts`'s `CONTENT_LIMITS.IMPORT_SOURCE.maxSizeBytes`) —
 * duplicated here as a small local constant per this codebase's established
 * per-phase-local-constant convention, rather than a cross-package import of
 * an API-internal constant. */
const MAX_SIZE_BYTES = 5 * 1024 * 1024;

export interface FileDropzoneProps {
  onFileSelected: (file: File) => void;
  disabled?: boolean;
}

function extensionOf(filename: string): string {
  const dot = filename.lastIndexOf('.');
  return dot === -1 ? '' : filename.slice(dot).toLowerCase();
}

/**
 * DoD item 2 — file type/size validated client-side before anything is
 * sent; a rejected file never triggers a network call. Extension is
 * authoritative (case-insensitive `.csv`/`.xlsx`); MIME type is
 * deliberately not checked here — browsers report CSV MIME inconsistently
 * across operating systems (`text/csv`, `application/vnd.ms-excel`, or
 * empty), and the server always does the real determination by
 * content-sniffing regardless (`content-validation.ts`), so a client-side
 * MIME check would only produce false rejections.
 *
 * No file-upload primitive existed anywhere in `components/ui/` before this
 * (verified during F8 planning) — this is the first one, purpose-built for
 * import files rather than a generic reusable dropzone, since nothing else
 * in this codebase uploads a file through the browser this way yet (logo
 * upload uses a plain `<input type="file">`, not drag-and-drop).
 */
export function FileDropzone({ onFileSelected, disabled = false }: FileDropzoneProps) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [rejection, setRejection] = useState<string | null>(null);

  const validateAndSelect = useCallback(
    (file: File) => {
      setRejection(null);
      if (!ACCEPTED_EXTENSIONS.includes(extensionOf(file.name))) {
        setRejection('Choose a .csv or .xlsx file.');
        return;
      }
      if (file.size > MAX_SIZE_BYTES) {
        setRejection('This file is larger than 5MB. Split it into smaller files and try again.');
        return;
      }
      onFileSelected(file);
    },
    [onFileSelected],
  );

  return (
    <div className="space-y-2">
      <div
        role="button"
        tabIndex={disabled ? -1 : 0}
        aria-disabled={disabled || undefined}
        onClick={() => !disabled && inputRef.current?.click()}
        onKeyDown={(e) => {
          if (!disabled && (e.key === 'Enter' || e.key === ' ')) {
            e.preventDefault();
            inputRef.current?.click();
          }
        }}
        onDragOver={(e) => {
          e.preventDefault();
          if (!disabled) setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          if (disabled) return;
          const file = e.dataTransfer.files[0];
          if (file) validateAndSelect(file);
        }}
        className={cn(
          'flex flex-col items-center gap-2 rounded-md border-2 border-dashed px-6 py-10 text-center transition-colors',
          dragging ? 'border-brand-primary bg-brand-primary/5' : 'border-border',
          disabled
            ? 'cursor-not-allowed opacity-50'
            : 'cursor-pointer hover:border-brand-primary/60',
        )}
      >
        <Upload className="size-6 text-text-muted" aria-hidden />
        <p className="text-sm font-medium text-text-primary">
          Drag a file here, or <span className="text-brand-primary underline">browse</span>
        </p>
        <p className="text-xs text-text-muted">CSV or Excel (.xlsx), up to 5MB</p>
        <label htmlFor={inputId} className="sr-only">
          Choose a file to import
        </label>
        <input
          id={inputId}
          ref={inputRef}
          type="file"
          accept=".csv,.xlsx"
          disabled={disabled}
          className="sr-only"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) validateAndSelect(file);
            e.target.value = '';
          }}
        />
      </div>
      {rejection ? (
        <p role="alert" className="text-sm font-medium text-danger">
          {rejection}
        </p>
      ) : null}
    </div>
  );
}
