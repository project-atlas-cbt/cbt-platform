/**
 * The ExamKeep symbol (margin rule, ruled lines, one filled answer bubble),
 * inline so it needs no request and no CSP change. Its two colours are the
 * product's own logo colours, not theme tokens: a school's brand colour
 * themes the interface, never the product mark. Drawn on a 64-unit grid;
 * render it at 16, 32 or 48 px so every edge lands on a whole pixel.
 */
export function ProductMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden focusable="false">
      <path d="M8,4 h8 v56 h-8 Z" fill="#D9534F" />
      <path
        d="M24,12 h32 v8 h-32 Z M24,28 h12 v8 h-12 Z M24,44 h32 v8 h-32 Z M40,32 a8,8 0 1,0 16,0 a8,8 0 1,0 -16,0 Z"
        fill="#1D4ED8"
      />
    </svg>
  );
}
