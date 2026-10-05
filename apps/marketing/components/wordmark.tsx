import Image from 'next/image';
import { site } from '@/lib/site';

/**
 * The ExamKeep logo (Margin E, horizontal full-colour lockup) from the brand
 * pack in /mnt/project-files/branding/logo/examkeep-logo; its USAGE.md sets
 * the 24 px minimum height and the clear space. The wordmark is drawn, not
 * typed, so a different PRODUCT_NAME needs new logo files as well.
 */
export function Wordmark() {
  return (
    <Image
      src="/brand/examkeep-horizontal-colour.svg"
      alt={site.name}
      width={152}
      height={28}
      unoptimized
      priority
      className="h-7 w-auto"
    />
  );
}
