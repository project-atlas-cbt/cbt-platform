import type { Metadata } from 'next';
import Link from 'next/link';
import { CtaBand } from '@/components/cta-band';
import { ProductShot } from '@/components/product-shot';
import { Container, PageHeader, SectionHeading, Tick } from '@/components/ui';
import { site } from '@/lib/site';

export const metadata: Metadata = {
  title: 'Exam-day reliability',
  description: `How ${site.name} keeps computer-based exams running through power cuts, dropped connections, slow shared internet and older lab computers.`,
  alternates: { canonical: '/exam-day-reliability' },
};

const incidents = [
  {
    title: 'The connection drops mid-exam',
    body: 'Students keep answering. Each answer is saved on the computer the moment it is chosen and sent to the server when the connection returns. If an older answer arrives after a newer one, the newer answer is kept.',
  },
  {
    title: 'The power goes off',
    body: 'Answers already saved on the computer survive. When the computer is back on, the student signs in and continues on the same computer, with every saved answer in place.',
  },
  {
    title: 'A computer fails completely',
    body: 'Move the student to a spare computer, where they sign in and resume with everything that had reached the server. Anything still on the old computer is sent when it is turned back on and the exam page reopened.',
  },
  {
    title: 'Time runs out while offline',
    body: 'Time is kept by the server, not the computer, so changing a computer’s clock changes nothing. Answers made before time ran out and received shortly after are accepted within a short grace period, and flagged so staff can see it.',
  },
  {
    title: 'A student forgets to submit',
    body: 'When a student’s time is up, their paper is submitted for them and marked, with every answer they saved.',
  },
  {
    title: 'Someone opens a second tab',
    body: 'Only one tab answers at a time. A second tab shows that the exam is open elsewhere and can take over only after the first has saved everything, so answers never conflict.',
  },
];

const baseline = [
  ['Screen', '1366 × 768, and usable down to 1024 × 600'],
  ['Memory', 'About 4 GB'],
  ['Processor', 'Dual-core, tested with the processor slowed four times'],
  ['Browser', 'Chrome or Edge 111 and later; Firefox 115 ESR on Windows 7 and 8.1'],
  ['Connection', 'One shared line; tested at 2 Mbit/s with 300 ms delay and 3% packet loss'],
  ['Storage', 'A few hundred MB free for the browser'],
];

const checks = [
  ['Local answer storage', 'Must pass', 'Answers have to survive a dropped connection.'],
  ['Network', 'Must pass', 'Starting needs the server; after Start the exam tolerates outages.'],
  [
    'Space for the paper',
    'Must pass',
    'The paper and its pictures are stored on the computer at Start.',
  ],
  ['Browser version', 'Warns', 'Points older Windows computers to Firefox ESR.'],
  ['Screen size', 'Warns', 'Asks the student to maximise the window or reset the zoom.'],
];

export default function ReliabilityPage() {
  return (
    <>
      <PageHeader
        eyebrow="Exam-day reliability"
        title="Built for the lab you actually have"
        lead="Power cuts, a shared connection, computers that have seen a few sessions. An exam has to survive all of them, so the platform was designed and tested around them."
      />

      <section aria-labelledby="incidents-title" className="py-20 sm:py-24">
        <Container>
          <SectionHeading
            id="incidents-title"
            eyebrow="When something goes wrong"
            title="What happens, and what the student sees"
          />
          <div className="mt-12 grid gap-px overflow-hidden rounded-xl border border-rule bg-rule md:grid-cols-2 lg:grid-cols-3">
            {incidents.map((item) => (
              <article key={item.title} className="bg-surface p-7">
                <h3 className="font-display text-lg font-semibold text-ink">{item.title}</h3>
                <p className="mt-3 leading-relaxed text-ink-2">{item.body}</p>
              </article>
            ))}
          </div>
        </Container>
      </section>

      <section
        id="lab-computers"
        aria-labelledby="lab-title"
        className="border-y border-rule bg-surface py-20 sm:py-24"
      >
        <Container className="grid gap-14 lg:grid-cols-2">
          <div>
            <SectionHeading
              id="lab-title"
              eyebrow="Lab computers"
              title="No new computers needed"
              lead="The exam screen is designed and tested for the machines most school labs already have. Nothing is installed: it runs in the browser."
            />
            <table className="mt-10 w-full border-collapse text-left text-[0.9375rem]">
              <caption className="sr-only">Supported lab computer</caption>
              <tbody>
                {baseline.map(([item, value]) => (
                  <tr key={item} className="border-t border-rule">
                    <th scope="row" className="w-32 py-3.5 pr-4 align-top font-semibold text-ink">
                      {item}
                    </th>
                    <td className="py-3.5 text-ink-2">{value}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div>
            <h3 className="font-display text-2xl font-semibold text-ink">
              A check before every Start
            </h3>
            <p className="mt-3 leading-relaxed text-ink-2">
              Before a student can press Start, their computer is checked. Problems that would put
              answers at risk stop the start; smaller ones show a warning the invigilator can fix.
            </p>
            <table className="mt-8 w-full border-collapse text-left text-[0.9375rem]">
              <caption className="sr-only">Computer check before an exam starts</caption>
              <thead>
                <tr className="text-sm text-ink-muted">
                  <th scope="col" className="pb-3 pr-4 font-medium">
                    Check
                  </th>
                  <th scope="col" className="pb-3 pr-4 font-medium">
                    Result
                  </th>
                  <th scope="col" className="pb-3 font-medium">
                    Why
                  </th>
                </tr>
              </thead>
              <tbody>
                {checks.map(([check, result, why]) => (
                  <tr key={check} className="border-t border-rule align-top">
                    <th scope="row" className="py-3.5 pr-4 font-semibold text-ink">
                      {check}
                    </th>
                    <td className="py-3.5 pr-4 whitespace-nowrap text-ink-2">{result}</td>
                    <td className="py-3.5 text-ink-2">{why}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Container>
      </section>

      <section aria-labelledby="bandwidth-title" className="py-20 sm:py-24">
        <Container className="grid items-center gap-12 lg:grid-cols-[1.1fr_0.9fr]">
          <ProductShot
            kind="exam"
            title="The student exam screen"
            caption="Once a paper has started, it lives on the computer. The connection only carries answers."
          />
          <div>
            <SectionHeading
              id="bandwidth-title"
              eyebrow="A slow, shared line"
              title="The exam doesn’t wait on the internet"
            />
            <ul className="mt-8 space-y-4 text-ink-2">
              {[
                'Open your school’s address once on each computer before exam day, and the exam screen loads from the computer itself on the day.',
                'Each paper, pictures included, is downloaded once when the student presses Start.',
                'After that, the connection only carries small answer updates.',
              ].map((point) => (
                <li key={point} className="flex gap-3">
                  <Tick className="mt-0.5" />
                  <span className="leading-relaxed">{point}</span>
                </li>
              ))}
            </ul>
            <p className="mt-8 leading-relaxed text-ink-2">
              Getting a lab ready takes an afternoon.{' '}
              <Link
                href="/guides/cbt-lab-checklist"
                className="font-semibold text-accent underline underline-offset-4"
              >
                Read the lab checklist
              </Link>
              .
            </p>
          </div>
        </Container>
      </section>

      <CtaBand
        title="Run a practice sitting with us"
        body="We’ll help you prepare the lab and run a short practice exam with one class before your first real one."
      />
    </>
  );
}
