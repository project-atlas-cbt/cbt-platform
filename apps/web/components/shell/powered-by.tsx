import { cn } from '@/lib/utils';
import { ProductMark } from './product-mark';

const productName = process.env.NEXT_PUBLIC_PRODUCT_NAME ?? 'CBT Platform';

/**
 * The one place the product names itself inside a school's interface (Haneef,
 * 2026-10-09): the sidebar foot and the sign-in page. Grey, so it never
 * competes with the school's own colour; never on printed reports, which
 * are the school's documents.
 */
export function PoweredBy({ className }: { className?: string }) {
  return (
    <p className={cn('flex items-center gap-1.5 text-xs text-text-muted', className)}>
      <ProductMark tone="muted" className="size-3.5 shrink-0 opacity-70" />
      <span>
        Powered by <span className="font-medium">{productName}</span>
      </span>
    </p>
  );
}
