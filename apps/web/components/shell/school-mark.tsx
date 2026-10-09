import { cn } from '@/lib/utils';

/**
 * The school's logo where it has uploaded one, otherwise its initials on its
 * brand colour, so every school's interface opens with its own mark.
 * `logoUrl` is the long-lived signed URL `tenant/resolve` returns (see
 * `TenantBrandLine`), so a plain `<img>` is safe.
 */
export function SchoolMark({
  name,
  logoUrl,
  className,
}: {
  name: string;
  logoUrl: string | null;
  className?: string;
}) {
  if (logoUrl) {
    return (
      <img
        src={logoUrl}
        alt={`${name} logo`}
        className={cn('size-9 shrink-0 object-contain', className)}
      />
    );
  }
  return (
    <span
      aria-hidden
      className={cn(
        'flex size-9 shrink-0 items-center justify-center rounded-md bg-brand-primary text-sm font-semibold text-brand-primary-foreground',
        className,
      )}
    >
      {initials(name)}
    </span>
  );
}

/** "Our Lady of Apostles" → "OLA"; "Oakridge College" → "OC"; at most three letters. */
export function initials(name: string): string {
  const words = name
    .split(/\s+/)
    .map((word) => word.replace(/[^\p{L}\p{N}]/gu, ''))
    .filter((word) => word.length > 0 && !/^(of|the|and|&)$/i.test(word));
  if (words.length === 0) return '?';
  return words
    .slice(0, 3)
    .map((word) => word[0]!.toUpperCase())
    .join('');
}
