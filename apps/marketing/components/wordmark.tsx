import { site } from '@/lib/site';

/**
 * Placeholder wordmark until a logo is chosen: the product name in the
 * display face beside a filled answer circle. Swap this one component when
 * the real logo arrives.
 */
export function Wordmark() {
  return (
    <span className="inline-flex items-center gap-2">
      <span
        aria-hidden="true"
        className="relative inline-flex size-6 items-center justify-center rounded-full border-2 border-accent"
      >
        <span className="size-3 rounded-full bg-accent" />
      </span>
      <span className="font-display text-xl font-semibold tracking-tight text-ink">
        {site.name}
      </span>
    </span>
  );
}
