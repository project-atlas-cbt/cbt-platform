import type { Metadata } from 'next';
import { CtaBand } from '@/components/cta-band';
import { ProductShot } from '@/components/product-shot';
import { Container, PageHeader, SectionHeading } from '@/components/ui';
import { examSteps } from '@/lib/content';
import { site } from '@/lib/site';

export const metadata: Metadata = {
  title: 'How it works',
  description: `How a school starts with ${site.name}, from a demo to its first computer-based exam, and how every exam runs after that.`,
  alternates: { canonical: '/how-it-works' },
};

const journey = [
  {
    title: 'Request a demo',
    body: 'Tell us about your school. We show you a full sitting, from a question being approved to results being published, and answer your staff’s questions.',
    you: 'An hour with the people who will run exams: the principal or VP academics, the exam officer and your ICT lead.',
  },
  {
    title: 'Agree the details and pay',
    body: 'We agree the number of students and your school’s web address, such as yourschool.{root}, and send the agreement, including how your data is handled, and an invoice.',
    you: 'The name and email address of the person who will be your school admin.',
  },
  {
    title: 'Receive your activation key',
    body: 'Once payment is confirmed we create your school’s space and email an activation link to your school admin. The key in it is used once, to activate the school.',
    you: 'Your school admin opens the activation link in the email and sets a password.',
  },
  {
    title: 'Set up the school in the wizard',
    body: 'The wizard walks through the school profile, logo and colour, academic session and term, departments, classes, subjects, staff and students. It saves as you go and can be finished later.',
    you: 'Class lists and staff lists. A spreadsheet is fine: students and teachers can be imported from a CSV template.',
  },
  {
    title: 'Prepare questions and the lab',
    body: 'Teachers write or upload questions and HODs approve them. Each lab computer opens your school’s address once, so the exam screen loads from the computer itself on the day.',
    you: 'A lab contact, and a short practice sitting with one class before the first real exam.',
  },
  {
    title: 'Run your first exam',
    body: 'Build the exam from approved questions, open it for the first batch, and watch the sitting live. Papers are marked as they are submitted.',
    you: 'Invigilators in the lab, and the exam officer at the Exam Control Center.',
  },
];

export default function HowItWorksPage() {
  return (
    <>
      <PageHeader
        eyebrow="How it works"
        title="From a demo to your first computer-based exam"
        lead={`${site.name} is set up for each school by us, so your school’s space, address and records are created correctly from the start. Here is what happens, and what each step needs from you.`}
      />

      <section aria-labelledby="journey-title" className="py-20 sm:py-24">
        <Container>
          <SectionHeading
            id="journey-title"
            eyebrow="Getting started"
            title="Six steps, in this order"
          />
          <ol className="mt-12 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {journey.map((step, i) => (
              <li
                key={step.title}
                className="flex flex-col rounded-xl border border-rule bg-surface p-7"
              >
                <span className="font-display text-sm font-semibold text-accent">Step {i + 1}</span>
                <h3 className="mt-2 font-display text-xl font-semibold text-ink">{step.title}</h3>
                <p className="mt-3 flex-1 leading-relaxed text-ink-2">
                  {step.body.replace('{root}', site.rootDomain)}
                </p>
                <p className="mt-5 border-t border-rule pt-4 text-sm leading-relaxed text-ink-muted">
                  <span className="font-semibold text-ink-2">What you need: </span>
                  {step.you}
                </p>
              </li>
            ))}
          </ol>
        </Container>
      </section>

      <section
        aria-labelledby="exam-title"
        className="border-y border-rule bg-surface py-20 sm:py-24"
      >
        <Container className="grid gap-14 lg:grid-cols-[1fr_1fr]">
          <div>
            <SectionHeading
              id="exam-title"
              eyebrow="Every exam after that"
              title="The same five steps, every time"
              lead="Each step is done by the person whose job it already is, and each leaves a record."
            />
            <div className="mt-10">
              <ProductShot
                kind="setup"
                title="The school setup wizard"
                caption="The setup wizard. Your school’s colour and logo carry through to every screen your staff and students see."
              />
            </div>
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

      <CtaBand />
    </>
  );
}
