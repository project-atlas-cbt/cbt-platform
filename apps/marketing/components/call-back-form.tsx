import Link from 'next/link';

const field =
  'mt-1.5 block w-full min-h-11 rounded-md border border-rule bg-surface px-3 text-base text-ink focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30';
const label = 'block text-sm font-semibold text-ink';

/**
 * The short alternative to a demo request: leave a number and we call back.
 * A plain HTML form (works without JavaScript), posted to /api/call-back.
 */
export function CallBackForm({ id = 'call-back' }: { id?: string }) {
  return (
    <form
      id={id}
      action="/api/call-back"
      method="post"
      aria-labelledby={`${id}-title`}
      className="scroll-mt-24 rounded-lg border border-rule bg-surface p-5 sm:p-6"
    >
      <h3 id={`${id}-title`} className="font-display text-lg font-semibold text-ink">
        Rather we call you?
      </h3>
      <p className="mt-1 text-[0.9375rem] text-ink-2">
        Leave your number and we’ll call or WhatsApp you to answer your questions.
      </p>
      <div className="mt-4 grid gap-4 sm:grid-cols-3">
        <div>
          <label htmlFor={`${id}-name`} className={label}>
            Your name
          </label>
          <input
            id={`${id}-name`}
            name="name"
            required
            maxLength={120}
            autoComplete="name"
            className={field}
          />
        </div>
        <div>
          <label htmlFor={`${id}-phone`} className={label}>
            Phone or WhatsApp
          </label>
          <input
            id={`${id}-phone`}
            name="phone"
            type="tel"
            required
            minLength={7}
            maxLength={24}
            pattern="[+0-9][0-9 \(\)\-]*"
            autoComplete="tel"
            inputMode="tel"
            placeholder="0803 123 4567"
            className={field}
          />
        </div>
        <div>
          <label htmlFor={`${id}-school`} className={label}>
            School <span className="font-normal text-ink-muted">(optional)</span>
          </label>
          <input
            id={`${id}-school`}
            name="school"
            maxLength={160}
            autoComplete="organization"
            className={field}
          />
        </div>
      </div>

      {/* Hidden from people; bots fill it in. */}
      <div aria-hidden="true" className="absolute -left-[9999px] h-px w-px overflow-hidden">
        <label htmlFor={`${id}-website`}>Leave this empty</label>
        <input id={`${id}-website`} name="website" tabIndex={-1} autoComplete="off" />
      </div>

      <div className="mt-4 flex gap-3">
        <input
          id={`${id}-consent`}
          name="consent"
          type="checkbox"
          value="yes"
          required
          className="mt-1 size-5 shrink-0 accent-accent"
        />
        <label htmlFor={`${id}-consent`} className="text-sm leading-relaxed text-ink-2">
          You can call or message me about this by phone or WhatsApp. We also note which pages of
          this site you looked at today, so we know what interests you. See the{' '}
          <Link href="/privacy" className="text-accent underline underline-offset-4">
            privacy notice
          </Link>
          .
        </label>
      </div>
      <button
        type="submit"
        className="mt-4 inline-flex min-h-11 items-center justify-center rounded-md border border-ink bg-surface px-5 text-[0.9375rem] font-semibold text-ink hover:bg-paper"
      >
        Call me back
      </button>
    </form>
  );
}
