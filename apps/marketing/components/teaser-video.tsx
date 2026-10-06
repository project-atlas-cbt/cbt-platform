/**
 * The one-minute product tour.
 *
 * Recorded in the real app on the fictional demo school, like the
 * screenshots (`scripts/teaser/`). It plays only when pressed, and nothing but
 * the poster loads before that, so a visitor on mobile data pays for the video
 * only if they choose to watch it. Its captions are part of the picture, and
 * its only sound is the interface: clicks, typing and confirmation tones.
 */
export function TeaserVideo({ title }: { title: string }) {
  return (
    <figure className="w-full">
      <div className="overflow-hidden rounded-xl border border-rule bg-surface shadow-[0_1px_2px_rgb(20_22_27/0.06),0_18px_40px_-24px_rgb(20_22_27/0.35)]">
        <video
          className="block aspect-video h-auto w-full bg-surface-muted"
          controls
          preload="none"
          playsInline
          poster="/teaser/examkeep-tour-poster.jpg"
          width={1920}
          height={1080}
          aria-label={title}
        >
          <source src="/teaser/examkeep-tour.mp4" type="video/mp4" />
        </video>
      </div>
    </figure>
  );
}
