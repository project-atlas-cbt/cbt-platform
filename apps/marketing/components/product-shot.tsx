import Image from 'next/image';

/**
 * A product screen in a plain browser frame.
 *
 * Every picture is a capture of the real app at 1366 × 768, working on a
 * fictional demo school (`pnpm --filter @atlas/load demo-school`), never a
 * retouched image (decided 2026-10-04). `kind` names the screen; its
 * capture lives at `public/screens/<kind>.png`.
 */
export type ShotKind = 'exam' | 'control' | 'review' | 'results' | 'setup';

export function ProductShot({
  kind,
  title,
  caption,
  priority = false,
}: {
  kind: ShotKind;
  title: string;
  caption?: string;
  priority?: boolean;
}) {
  return (
    <figure className="w-full">
      <div className="overflow-hidden rounded-xl border border-rule bg-surface shadow-[0_1px_2px_rgb(20_22_27/0.06),0_18px_40px_-24px_rgb(20_22_27/0.35)]">
        <div
          className="flex items-center gap-1.5 border-b border-rule bg-surface-muted px-3 py-2"
          aria-hidden="true"
        >
          <span className="size-2.5 rounded-full bg-rule" />
          <span className="size-2.5 rounded-full bg-rule" />
          <span className="size-2.5 rounded-full bg-rule" />
        </div>
        <Image
          src={`/screens/${kind}.png`}
          alt={title}
          width={1366}
          height={768}
          priority={priority}
          sizes="(min-width: 1024px) 60vw, 100vw"
          className="h-auto w-full"
        />
      </div>
      {caption ? (
        <figcaption className="mt-3 text-sm leading-relaxed text-ink-muted">{caption}</figcaption>
      ) : null}
    </figure>
  );
}
