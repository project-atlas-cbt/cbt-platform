import type { Metadata } from 'next';
import Link from 'next/link';
import { Container, PageHeader, Tick } from '@/components/ui';
import { interestOptions, roleOptions, studentRanges } from '@/lib/lead';
import { site, whatsappLink } from '@/lib/site';
import { nigerianStates } from '@/lib/states';

export const metadata: Metadata = {
  title: 'Request a demo',
  description: `See ${site.name} run a full computer-based exam, from an approved question to published results. Request a demo or a price quote for your school.`,
  alternates: { canonical: '/request-a-demo' },
};

const field =
  'mt-1.5 block w-full min-h-11 rounded-md border border-rule bg-surface px-3 text-base text-ink shadow-[inset_0_1px_0_rgb(20_22_27/0.03)] focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30';
const label = 'block text-[0.9375rem] font-semibold text-ink';

export default function RequestDemoPage() {
  const whatsapp = whatsappLink(site, `Hello, I'd like a demo of ${site.name} for my school.`);
  return (
    <>
      <PageHeader
        eyebrow="Request a demo"
        title="See a full exam, start to finish"
        lead="Tell us a little about your school. We’ll arrange a time to show you a sitting from an approved question to published results, and send a quote if you ask for one."
      />

      <Container className="grid gap-14 py-16 sm:py-20 lg:grid-cols-[1.25fr_0.75fr]">
        <form
          id="form"
          action="/api/demo-request"
          method="post"
          className="space-y-6"
          aria-describedby="form-note"
        >
          <div className="grid gap-6 sm:grid-cols-2">
            <div>
              <label htmlFor="name" className={label}>
                Your name
              </label>
              <input
                id="name"
                name="name"
                required
                maxLength={120}
                autoComplete="name"
                className={field}
              />
            </div>
            <div>
              <label htmlFor="role" className={label}>
                Your role
              </label>
              <select id="role" name="role" required defaultValue="" className={field}>
                <option value="" disabled>
                  Choose one
                </option>
                {roleOptions.map((o) => (
                  <option key={o}>{o}</option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="school" className={label}>
                School name
              </label>
              <input
                id="school"
                name="school"
                required
                maxLength={160}
                autoComplete="organization"
                className={field}
              />
            </div>
            <div>
              <label htmlFor="state" className={label}>
                State
              </label>
              <select id="state" name="state" required defaultValue="" className={field}>
                <option value="" disabled>
                  Choose a state
                </option>
                {nigerianStates.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="students" className={label}>
                Number of students
              </label>
              <select id="students" name="students" required defaultValue="" className={field}>
                <option value="" disabled>
                  Choose a range
                </option>
                {studentRanges.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="interest" className={label}>
                You would like
              </label>
              <select
                id="interest"
                name="interest"
                required
                defaultValue="A demo"
                className={field}
              >
                {interestOptions.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="phone" className={label}>
                Phone or WhatsApp number
              </label>
              <input
                id="phone"
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
              <label htmlFor="email" className={label}>
                Email address
              </label>
              <input
                id="email"
                name="email"
                type="email"
                required
                maxLength={160}
                autoComplete="email"
                spellCheck={false}
                className={field}
              />
            </div>
          </div>
          <div>
            <label htmlFor="message" className={label}>
              Anything we should know?{' '}
              <span className="font-normal text-ink-muted">(optional)</span>
            </label>
            <textarea
              id="message"
              name="message"
              rows={4}
              maxLength={2000}
              className={`${field} py-2.5`}
              placeholder="For example: how many computers your lab has, or when your next exams are."
            />
          </div>

          {/* Hidden from people; bots fill it in. */}
          <div aria-hidden="true" className="absolute -left-[9999px] h-px w-px overflow-hidden">
            <label htmlFor="website">Leave this empty</label>
            <input id="website" name="website" tabIndex={-1} autoComplete="off" />
          </div>

          <div className="flex gap-3">
            <input
              id="consent"
              name="consent"
              type="checkbox"
              value="yes"
              required
              className="mt-1 size-5 shrink-0 accent-accent"
            />
            <label htmlFor="consent" className="text-[0.9375rem] leading-relaxed text-ink-2">
              You can contact me about this request by phone, WhatsApp or email. See the{' '}
              <Link href="/privacy" className="text-accent underline underline-offset-4">
                privacy notice
              </Link>
              .
            </label>
          </div>

          <button
            type="submit"
            className="inline-flex min-h-11 items-center justify-center rounded-md bg-accent px-6 text-[0.9375rem] font-semibold text-white hover:bg-accent-hover"
          >
            Send request
          </button>
          <p id="form-note" className="text-sm text-ink-muted">
            We’ll reply to arrange a time that suits you.
          </p>
        </form>

        <aside className="space-y-8 lg:border-l lg:border-rule lg:pl-10">
          <div>
            <h2 className="font-display text-xl font-semibold text-ink">In the demo</h2>
            <ul className="mt-4 space-y-3 text-ink-2">
              {[
                'A teacher’s question going through HOD review',
                'Building an exam and opening a sitting',
                'A student’s exam, including a dropped connection',
                'The live Exam Control Center',
                'Marking, results and publication',
              ].map((item) => (
                <li key={item} className="flex gap-3">
                  <Tick className="mt-0.5" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
          {whatsapp || site.email || site.phone ? (
            <div>
              <h2 className="font-display text-xl font-semibold text-ink">Prefer to talk now?</h2>
              <ul className="mt-4 space-y-2 text-ink-2">
                {whatsapp ? (
                  <li>
                    <a
                      href={whatsapp}
                      rel="noopener"
                      className="font-semibold text-accent underline underline-offset-4"
                    >
                      Chat on WhatsApp
                    </a>
                  </li>
                ) : null}
                {site.phone ? (
                  <li>
                    <a href={`tel:${site.phone.replace(/\s/g, '')}`} className="hover:text-ink">
                      {site.phone}
                    </a>
                  </li>
                ) : null}
                {site.email ? (
                  <li>
                    <a href={`mailto:${site.email}`} className="hover:text-ink">
                      {site.email}
                    </a>
                  </li>
                ) : null}
              </ul>
            </div>
          ) : null}
        </aside>
      </Container>
    </>
  );
}
