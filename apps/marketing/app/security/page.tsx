import type { Metadata } from 'next';
import { CtaBand } from '@/components/cta-band';
import { Container, PageHeader, SectionHeading } from '@/components/ui';
import { site } from '@/lib/site';

export const metadata: Metadata = {
  title: 'Security and data',
  description: `How ${site.name} protects exam integrity, keeps each school’s data separate, and preserves academic records.`,
  alternates: { canonical: '/security' },
};

const groups = [
  {
    title: 'Exam integrity',
    items: [
      [
        'Answer keys stay on the server',
        'The correct answers are never sent to a student’s computer during an exam. A release-blocking test checks this on every change.',
      ],
      [
        'The server keeps time',
        'Each student’s timer is kept by the server. Changing a computer’s clock does nothing.',
      ],
      [
        'Scores are worked out on the server',
        'Marking uses the answers the server recorded. The student’s computer never decides a score.',
      ],
      [
        'Old answers can’t overwrite new ones',
        'Each answer carries a sequence number, so a delayed update never replaces a later choice.',
      ],
      [
        'Every exam keeps its exact questions',
        'An exam stores the approved version of each question its students saw, so past papers never change.',
      ],
    ],
  },
  {
    title: 'Your school’s data',
    items: [
      [
        'Each school is separate',
        'Every school’s records are kept apart in three layers, down to rules enforced by the database itself. One school can never see another’s.',
      ],
      [
        'Roles decide what each person sees',
        'A teacher sees their own subjects and classes; an HOD their department; students only their own exams and published results.',
      ],
      [
        'Sensitive actions are recorded',
        'Approvals, publications, result changes and other sensitive actions are written to an append-only audit trail.',
      ],
      [
        'Nothing is deleted when a subscription lapses',
        'Academic records are kept. You can read them during and after the grace period, and renewing restores full access.',
      ],
      [
        'Our own access is limited and recorded',
        'Our staff cannot write your questions. Any change they make to your academic records needs a stated reason and appears in an audit view your school admin can see.',
      ],
    ],
  },
  {
    title: 'Accounts and infrastructure',
    items: [
      [
        'Encrypted connections',
        'Every page and request uses HTTPS. Sign-in cookies cannot be read by scripts on the page.',
      ],
      [
        'Limits on sign-in',
        'Repeated failed sign-ins are slowed and limited. Our own platform administrators must use two-step verification.',
      ],
      [
        'Backups and recovery',
        'The database is backed up to a separate location, and restoring from a backup is rehearsed.',
      ],
      [
        'No advertising, no trackers',
        'We do not sell data or show advertising, and this website runs no third-party trackers.',
      ],
    ],
  },
];

export default function SecurityPage() {
  return (
    <>
      <PageHeader
        eyebrow="Security and data"
        title="A school’s results are a record. We treat them like one."
        lead="An exam platform holds what students answered and what they scored. Here is how it is protected, in plain language."
      />

      {groups.map((group, index) => (
        <section
          key={group.title}
          aria-labelledby={`group-${index}`}
          className={`py-16 sm:py-20 ${index % 2 === 1 ? 'border-y border-rule bg-surface' : ''}`}
        >
          <Container className="grid gap-10 lg:grid-cols-[0.7fr_1.3fr]">
            <SectionHeading id={`group-${index}`} title={group.title} />
            <dl className="divide-y divide-rule border-y border-rule">
              {group.items.map(([term, detail]) => (
                <div key={term} className="grid gap-2 py-5 sm:grid-cols-[0.8fr_1.2fr] sm:gap-6">
                  <dt className="font-semibold text-ink">{term}</dt>
                  <dd className="leading-relaxed text-ink-2">{detail}</dd>
                </div>
              ))}
            </dl>
          </Container>
        </section>
      ))}

      <section
        aria-labelledby="ndpa-title"
        className="border-t border-rule bg-surface py-16 sm:py-20"
      >
        <Container className="max-w-3xl">
          <SectionHeading
            id="ndpa-title"
            title="Data protection"
            lead="Your school is the controller of its students’ and staff’s data; we process it on your behalf, under a written data processing agreement. The platform is built to help schools meet their duties under the Nigeria Data Protection Act: data is kept only as long as the retention schedule says, and we support access and correction requests."
          />
        </Container>
      </section>

      <CtaBand
        title="Questions from your ICT or legal team?"
        body="We’re happy to go through the details with them, including the data processing agreement."
      />
    </>
  );
}
