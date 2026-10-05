import type { Metadata } from 'next';
import { CtaBand } from '@/components/cta-band';
import { Container, PageHeader, SectionHeading } from '@/components/ui';
import { site } from '@/lib/site';

export const metadata: Metadata = {
  title: 'About',
  description: `Why ${site.name} exists, and the principles it is built on.`,
  alternates: { canonical: '/about' },
};

const principles = [
  [
    'A school is its own space',
    'Each school’s records are kept apart from every other school’s, and each person sees only what their role allows.',
  ],
  [
    'The record comes first',
    'Submitted answers are not changed. A result can always be traced to the answers behind it, and any correction says who made it and why.',
  ],
  [
    'Absence is not a score',
    'A student who missed an exam is recorded as absent, not as zero, and a makeup never erases that record.',
  ],
  [
    'The exam belongs to the student in front of it',
    'The exam screen shows the exam and nothing else: no feeds, no distractions, a calm timer.',
  ],
  [
    'Stopping payment never deletes history',
    'Academic records are kept whether or not a subscription is renewed.',
  ],
  [
    'Built for real conditions',
    'Power cuts, shared connections and older computers are the normal case we design for, not an exception.',
  ],
];

export default function AboutPage() {
  return (
    <>
      <PageHeader
        eyebrow="About"
        title="We build one thing: a dependable way for schools to run their own exams on computers"
        lead={`${site.name} is not a learning platform, a past-questions app or a social network for students. It is the exam office, on computers: questions, review, exam day, marking and results, with every step on the record.`}
      />

      <section aria-labelledby="why-title" className="py-20 sm:py-24">
        <Container className="grid gap-12 lg:grid-cols-2">
          <SectionHeading
            id="why-title"
            eyebrow="Why it exists"
            title="Computer-based tests are now part of a Nigerian student’s life"
          />
          <div className="space-y-5 text-lg leading-relaxed text-ink-2">
            <p>
              Students meet computer-based tests in national examinations and university entrance.
              Inside many schools, exams are still printed, invigilated on paper and marked by hand,
              which takes weeks of teachers’ time and delays results.
            </p>
            <p>
              Schools that try CBT often find tools built for somewhere else: tools that assume a
              fast, constant connection, new computers and a single exam clock for everyone. We
              started from the conditions schools here actually have.
            </p>
          </div>
        </Container>
      </section>

      <section
        aria-labelledby="principles-title"
        className="border-y border-rule bg-surface py-20 sm:py-24"
      >
        <Container>
          <SectionHeading
            id="principles-title"
            eyebrow="What we hold to"
            title="The rules the platform is built on"
          />
          <dl className="mt-12 grid gap-x-10 gap-y-9 sm:grid-cols-2 lg:grid-cols-3">
            {principles.map(([term, detail]) => (
              <div key={term}>
                <dt className="font-display text-lg font-semibold text-ink">{term}</dt>
                <dd className="mt-2 leading-relaxed text-ink-2">{detail}</dd>
              </div>
            ))}
          </dl>
        </Container>
      </section>

      <CtaBand />
    </>
  );
}
