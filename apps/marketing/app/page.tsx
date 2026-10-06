import Link from 'next/link';
import { CtaBand } from '@/components/cta-band';
import { ProductShot } from '@/components/product-shot';
import { TeaserVideo } from '@/components/teaser-video';
import { ButtonLink, Container, JsonLd, SectionHeading, Tick } from '@/components/ui';
import { examSteps, faqs, roles, worries } from '@/lib/content';
import { site } from '@/lib/site';

export default function HomePage() {
  const faqExcerpt = faqs
    .flatMap((group) => group.items)
    .filter((item) =>
      [
        'What if the internet goes off during an exam?',
        'Which question types are supported?',
        'What happens to our records if we stop paying?',
        'Can we sign up and try it ourselves?',
      ].includes(item.q),
    );

  return (
    <>
      <JsonLd
        data={{
          '@context': 'https://schema.org',
          '@type': 'SoftwareApplication',
          name: site.name,
          applicationCategory: 'EducationalApplication',
          operatingSystem: 'Web browser',
          url: site.url,
          description:
            'Computer-based testing for secondary schools: question bank, HOD review, exam-day control, automatic marking and results.',
          audience: { '@type': 'EducationalAudience', educationalRole: 'school administrator' },
          areaServed: { '@type': 'Country', name: 'Nigeria' },
        }}
      />

      {/* Hero: the exercise-book page. Copy sits on the feint rules, inside the red margin. */}
      <section aria-labelledby="hero-title" className="ruled border-b border-rule">
        <Container className="grid items-center gap-12 py-14 sm:py-20 lg:grid-cols-[1.25fr_1fr] lg:gap-14 lg:py-24">
          <div className="margin-rule pl-6 sm:pl-9">
            <p className="text-sm font-semibold leading-[var(--spacing-line)] text-accent">
              Computer-based testing for Nigerian secondary schools
            </p>
            <h1
              id="hero-title"
              className="mt-[var(--spacing-line)] font-display text-[2.25rem] leading-[2.625rem] font-semibold tracking-tight text-ink [text-wrap:balance] sm:text-[2.875rem] sm:leading-[calc(var(--spacing-line)*1.5)] lg:text-[3.125rem] lg:leading-[calc(var(--spacing-line)*1.75)]"
            >
              Run your school’s exams on computers. Keep every answer, even when the network drops.
            </h1>
            <p className="mt-[var(--spacing-line)] max-w-xl text-lg leading-[var(--spacing-line)] text-ink-2">
              {site.name} takes your school from question bank to published results. Teachers set
              questions, HODs approve them, students sit timed exams in your computer lab, and
              objective answers are marked the moment a paper is submitted.
            </p>
            <div className="mt-[var(--spacing-line)] flex flex-wrap items-center gap-x-6 gap-y-3">
              <ButtonLink href="/request-a-demo">Request a demo</ButtonLink>
              <ButtonLink href="/how-it-works" variant="secondary">
                See how exam day works
              </ButtonLink>
            </div>
          </div>
          <ProductShot
            kind="exam"
            priority
            title="The student exam screen"
            caption="The student’s exam screen: one question at a time, their own timer, and a navigator showing what is answered."
          />
        </Container>
      </section>

      {/* The one-minute tour, straight after the promise it demonstrates. */}
      <section
        aria-labelledby="tour-title"
        className="border-b border-rule bg-surface py-20 sm:py-24"
      >
        <Container className="grid items-center gap-12 lg:grid-cols-[0.8fr_1.2fr] lg:gap-14">
          <div>
            <SectionHeading
              id="tour-title"
              eyebrow="The product in one minute"
              title="Watch an exam from question to result"
              lead="An HOD approves a question, a teacher watches the sitting live, a student loses the network mid-paper and carries on, and the results are published."
            />
            <p className="mt-6 text-[0.9375rem] leading-relaxed text-ink-muted">
              Recorded in {site.name} itself, using a fictional school. The video has captions and
              no voice-over, so it works with the sound off.
            </p>
          </div>
          <TeaserVideo title={`A one-minute tour of ${site.name}`} />
        </Container>
      </section>

      {/* The three worries a principal raises first, answered plainly. */}
      <section aria-labelledby="worries-title" className="py-20 sm:py-24">
        <Container>
          <SectionHeading
            id="worries-title"
            eyebrow="Before anything else"
            title="The three questions every principal asks us"
          />
          <div className="mt-12 grid gap-px overflow-hidden rounded-xl border border-rule bg-rule md:grid-cols-3">
            {worries.map((worry) => (
              <article key={worry.question} className="flex flex-col bg-surface p-7">
                <h3 className="font-display text-xl leading-snug font-semibold text-ink">
                  {worry.question}
                </h3>
                <p className="mt-4 flex-1 leading-relaxed text-ink-2">{worry.answer}</p>
                <Link
                  href={worry.href}
                  className="mt-6 text-[0.9375rem] font-semibold text-accent underline-offset-4 hover:underline"
                >
                  {worry.link}
                </Link>
              </article>
            ))}
          </div>
        </Container>
      </section>

      {/* A real sequence, so it is numbered. */}
      <section
        aria-labelledby="steps-title"
        className="border-y border-rule bg-surface py-20 sm:py-24"
      >
        <Container className="grid gap-14 lg:grid-cols-[0.9fr_1.1fr]">
          <div>
            <SectionHeading
              id="steps-title"
              eyebrow="How an exam runs"
              title="From a teacher’s question to a published result"
              lead="Every exam follows the same five steps, and every step leaves a record."
            />
            <ButtonLink href="/how-it-works" variant="quiet" className="mt-6">
              The full walkthrough
            </ButtonLink>
          </div>
          <ol className="relative space-y-8 border-l-2 border-feint pl-8">
            {examSteps.map((step, i) => (
              <li key={step.title} className="relative">
                <span
                  aria-hidden="true"
                  className="absolute -left-[3.0625rem] top-0 inline-flex size-8 items-center justify-center rounded-full border-2 border-accent bg-surface text-sm font-semibold text-accent"
                >
                  {i + 1}
                </span>
                <h3 className="text-lg font-semibold text-ink">{step.title}</h3>
                <p className="mt-2 leading-relaxed text-ink-2">{step.body}</p>
              </li>
            ))}
          </ol>
        </Container>
      </section>

      <section aria-labelledby="control-title" className="py-20 sm:py-24">
        <Container className="grid items-center gap-12 lg:grid-cols-[1.15fr_0.85fr]">
          <ProductShot
            kind="control"
            title="The Exam Control Center"
            caption="The Exam Control Center during a sitting. A student whose computer has gone quiet is flagged and listed first."
          />
          <div>
            <SectionHeading
              id="control-title"
              eyebrow="On exam day"
              title="See the whole lab from one screen"
              lead="The exam officer opens each sitting and watches it live: who has started, who is working, who has submitted, and whose computer has stopped responding."
            />
            <ul className="mt-8 space-y-3 text-ink-2">
              {[
                'Open the exam batch by batch to fit your computers',
                'Disconnected students flagged after 90 seconds of silence',
                'Absent students recorded, with makeup sittings later',
              ].map((point) => (
                <li key={point} className="flex gap-3">
                  <Tick className="mt-0.5" />
                  <span>{point}</span>
                </li>
              ))}
            </ul>
            <ButtonLink href="/features#exam-day" variant="quiet" className="mt-6">
              Everything on exam day
            </ButtonLink>
          </div>
        </Container>
      </section>

      <section
        aria-labelledby="roles-title"
        className="border-y border-rule bg-surface py-20 sm:py-24"
      >
        <Container>
          <SectionHeading
            id="roles-title"
            eyebrow="For everyone in the school"
            title="Each person sees the part of the job that is theirs"
            lead="Roles follow how a Nigerian secondary school already works, from the school admin to the student in the lab."
          />
          <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-5">
            {roles.map((role) => (
              <article key={role.role} className="rounded-xl border border-rule bg-paper p-6">
                <h3 className="font-display text-lg font-semibold text-ink">{role.role}</h3>
                <p className="mt-2 text-[0.9375rem] leading-relaxed text-ink-2">{role.summary}</p>
              </article>
            ))}
          </div>
          <ButtonLink href="/features" variant="quiet" className="mt-8">
            Features by role
          </ButtonLink>
        </Container>
      </section>

      <section aria-labelledby="review-title" className="py-20 sm:py-24">
        <Container className="grid items-center gap-12 lg:grid-cols-[0.85fr_1.15fr]">
          <div>
            <SectionHeading
              id="review-title"
              eyebrow="Questions you can stand behind"
              title="Every question is reviewed before a student sees it"
              lead="Teachers write; the head of department approves or sends it back with a note. Once approved, a question is locked, and every exam keeps the exact version its students answered."
            />
            <ButtonLink href="/features#question-bank" variant="quiet" className="mt-6">
              The question bank and review
            </ButtonLink>
          </div>
          <ProductShot
            kind="review"
            title="HOD question review"
            caption="An HOD reviewing a submitted question before approving it or requesting changes."
          />
        </Container>
      </section>

      {/* An answer-sheet panel: the school's records, filled in. */}
      <section
        aria-labelledby="records-title"
        className="border-y border-rule bg-surface py-20 sm:py-24"
      >
        <Container className="grid gap-12 lg:grid-cols-2">
          <SectionHeading
            id="records-title"
            eyebrow="Your records"
            title="Results you can explain, records you keep"
            lead="Schools are asked to account for a score long after the exam. Every result traces back to the answers a student recorded, and nothing is deleted if a subscription lapses."
          />
          <ul className="space-y-5">
            {[
              [
                'A',
                'Scores are worked out on the server from recorded answers, never by the student’s computer.',
              ],
              [
                'B',
                'Any correction to a result is recorded with the reason and the person who made it.',
              ],
              ['C', 'Results stay with staff until the school chooses to publish them.'],
              ['D', 'If a subscription lapses, nothing is deleted. Renewing restores everything.'],
            ].map(([letter, text]) => (
              <li key={letter} className="flex gap-4 rounded-xl border border-rule bg-paper p-5">
                <Tick className="mt-0.5" />
                <span className="leading-relaxed text-ink-2">{text}</span>
              </li>
            ))}
          </ul>
        </Container>
      </section>

      <section aria-labelledby="faq-title" className="py-20 sm:py-24">
        <Container className="grid gap-12 lg:grid-cols-[0.8fr_1.2fr]">
          <div>
            <SectionHeading
              id="faq-title"
              eyebrow="Questions"
              title="What schools ask before buying"
            />
            <ButtonLink href="/faq" variant="quiet" className="mt-6">
              All questions
            </ButtonLink>
          </div>
          <dl className="divide-y divide-rule border-y border-rule">
            {faqExcerpt.map((item) => (
              <div key={item.q} className="py-6">
                <dt className="font-semibold text-ink">{item.q}</dt>
                <dd className="mt-2 leading-relaxed text-ink-2">{item.a}</dd>
              </div>
            ))}
          </dl>
        </Container>
      </section>

      <CtaBand />
    </>
  );
}
