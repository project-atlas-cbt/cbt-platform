import type { Metadata } from 'next';
import { CtaBand } from '@/components/cta-band';
import { ProductShot, type ShotKind } from '@/components/product-shot';
import { Container, PageHeader, SectionHeading, Tick } from '@/components/ui';
import { featureGroups, roles } from '@/lib/content';
import { site } from '@/lib/site';

export const metadata: Metadata = {
  title: 'Features',
  description: `Everything ${site.name} does for a secondary school: exam-day control, question bank and HOD review, automatic marking, results, and school administration.`,
  alternates: { canonical: '/features' },
};

const shots: Record<string, { kind: ShotKind; title: string; caption: string }> = {
  'exam-day': {
    kind: 'control',
    title: 'The Exam Control Center',
    caption:
      'Live states for every student in a sitting, with disconnected computers listed first.',
  },
  'question-bank': {
    kind: 'review',
    title: 'HOD question review',
    caption: 'A submitted question in review: approve it, or request changes with a note.',
  },
  results: {
    kind: 'results',
    title: 'Exam results',
    caption: 'An exam’s marked and graded results, waiting for the school to publish them.',
  },
  'school-admin': {
    kind: 'setup',
    title: 'The school setup wizard',
    caption:
      'The setup wizard: each step can be saved and resumed, and the school’s colour carries through.',
  },
};

export default function FeaturesPage() {
  return (
    <>
      <PageHeader
        eyebrow="Features"
        title="Everything a school needs to run its own exams on computers"
        lead="Four parts of the job, built to work together: running the exam, preparing the questions, marking and publishing results, and running the school’s space."
      >
        <nav aria-label="On this page" className="mt-8">
          <ul className="flex flex-wrap gap-2">
            {featureGroups.map((group) => (
              <li key={group.id}>
                <a
                  href={`#${group.id}`}
                  className="inline-flex min-h-10 items-center rounded-full border border-rule bg-paper px-4 text-sm font-medium text-ink-2 hover:border-ink-muted hover:text-ink"
                >
                  {group.title}
                </a>
              </li>
            ))}
            <li>
              <a
                href="#by-role"
                className="inline-flex min-h-10 items-center rounded-full border border-rule bg-paper px-4 text-sm font-medium text-ink-2 hover:border-ink-muted hover:text-ink"
              >
                By role
              </a>
            </li>
          </ul>
        </nav>
      </PageHeader>

      {featureGroups.map((group, index) => {
        const shot = shots[group.id]!;
        return (
          <section
            key={group.id}
            id={group.id}
            aria-labelledby={`${group.id}-title`}
            className={`py-20 sm:py-24 ${index % 2 === 1 ? 'border-y border-rule bg-surface' : ''}`}
          >
            <Container>
              <div className="grid items-center gap-12 lg:grid-cols-2">
                <SectionHeading
                  id={`${group.id}-title`}
                  eyebrow={group.title}
                  title={group.lead.replace(/\.$/, '')}
                />
                <ProductShot kind={shot.kind} title={shot.title} caption={shot.caption} />
              </div>
              <ul className="mt-14 grid gap-x-10 gap-y-9 sm:grid-cols-2 lg:grid-cols-3">
                {group.items.map((item) => (
                  <li key={item.title}>
                    <h3 className="flex items-start gap-2.5 font-semibold text-ink">
                      <Tick className="mt-0.5" />
                      {item.title}
                    </h3>
                    <p className="mt-2 pl-7.5 leading-relaxed text-ink-2">
                      {item.body.replace('{root}', site.rootDomain)}
                    </p>
                  </li>
                ))}
              </ul>
            </Container>
          </section>
        );
      })}

      <section
        id="by-role"
        aria-labelledby="by-role-title"
        className="border-t border-rule bg-surface py-20 sm:py-24"
      >
        <Container>
          <SectionHeading
            id="by-role-title"
            eyebrow="By role"
            title="What each person in the school does with it"
          />
          <div className="mt-12 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {roles.map((role) => (
              <article key={role.role} className="rounded-xl border border-rule bg-paper p-7">
                <h3 className="font-display text-xl font-semibold text-ink">{role.role}</h3>
                <p className="mt-2 leading-relaxed text-ink-2">{role.summary}</p>
                <ul className="mt-5 space-y-2.5 text-[0.9375rem] text-ink-2">
                  {role.points.map((point) => (
                    <li key={point} className="flex gap-2.5">
                      <Tick className="mt-0.5 size-4" />
                      <span>{point}</span>
                    </li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
        </Container>
      </section>

      <CtaBand />
    </>
  );
}
