import type { Metadata } from 'next';
import { CtaBand } from '@/components/cta-band';
import { ButtonLink, Container, PageHeader, Tick } from '@/components/ui';
import { formatNaira, site } from '@/lib/site';

export const metadata: Metadata = {
  title: 'Pricing',
  description: `${site.name} is priced per student, per academic year, with every feature included. See the starting price or request a quote for your school.`,
  alternates: { canonical: '/pricing' },
};

const included = [
  'Every feature, for every role: school admin, moderator, HOD, teacher and student',
  'Your school’s own web address, logo and colour',
  'Question bank, HOD review, exam-day control, automatic marking and results',
  'Bulk import of students, teachers and questions',
  'Help with setup and a practice sitting before your first exam',
  'Your records kept, even if you don’t renew',
];

export default function PricingPage() {
  const price = site.priceFromNgn;
  return (
    <>
      <PageHeader
        eyebrow="Pricing"
        title="One price per student, per academic year"
        lead="Every school gets the whole platform. The price depends on how many students will sit exams."
      />

      <section aria-labelledby="price-title" className="py-20 sm:py-24">
        <Container className="grid gap-10 lg:grid-cols-[1fr_1fr]">
          <div className="rounded-2xl border border-rule bg-surface p-8 sm:p-10">
            <h2 id="price-title" className="text-sm font-semibold text-accent">
              Annual subscription
            </h2>
            {price ? (
              <p className="mt-4 font-display text-ink">
                <span className="text-lg text-ink-2">From </span>
                <span className="text-5xl font-semibold tracking-tight">{formatNaira(price)}</span>
                <span className="mt-2 block text-lg text-ink-2">per student, per year</span>
              </p>
            ) : (
              <p className="mt-4 font-display text-3xl leading-snug font-semibold text-ink">
                Priced for your number of students
              </p>
            )}
            <p className="mt-6 leading-relaxed text-ink-2">
              Tell us roughly how many students you have and we’ll send an exact quote.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <ButtonLink href="/request-a-demo#form">Request a quote</ButtonLink>
              <ButtonLink href="/request-a-demo" variant="secondary">
                Request a demo
              </ButtonLink>
            </div>
          </div>
          <div>
            <h2 className="font-display text-2xl font-semibold text-ink">
              Included for every school
            </h2>
            <ul className="mt-6 space-y-4 text-ink-2">
              {included.map((item) => (
                <li key={item} className="flex gap-3">
                  <Tick className="mt-0.5" />
                  <span className="leading-relaxed">{item}</span>
                </li>
              ))}
            </ul>
            <p className="mt-8 border-t border-rule pt-6 text-[0.9375rem] leading-relaxed text-ink-muted">
              The subscription runs for an academic year. When your subscription ends you keep full
              access for 14 days, and your records are never deleted.
            </p>
          </div>
        </Container>
      </section>

      <CtaBand />
    </>
  );
}
