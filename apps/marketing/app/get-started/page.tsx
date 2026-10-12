import type { Metadata } from 'next';
import { Container, PageHeader, SectionHeading } from '@/components/ui';
import { activationLinkDays, checklist, prepSections, roles, wizardSteps } from '@/lib/get-started';
import { site, whatsappLink } from '@/lib/site';

export const metadata: Metadata = {
  title: 'Get your school ready',
  description: `What to gather before you start setting up ${site.name}: details, spreadsheets, grading bands and questions, in the order the setup asks for them.`,
  alternates: { canonical: '/get-started' },
};

export default function GetStartedPage() {
  const whatsapp = whatsappLink(site, 'Hello, I have a question about setting up my school.');
  return (
    <>
      <PageHeader
        eyebrow="Getting started"
        title={`Get your school ready for ${site.name}`}
        lead="Gather these things first and setup takes about an hour in one sitting. It saves as you go, so you can also finish in stages."
      />

      <Container className="py-16 sm:py-20">
        <section aria-labelledby="roles-title">
          <SectionHeading id="roles-title" title="Who does what" />
          <ul className="mt-6 grid gap-4 md:grid-cols-2">
            {roles.map((r) => (
              <li key={r.who} className="rounded-xl border border-rule bg-surface p-6">
                <p className="font-display text-lg font-semibold text-ink">{r.who}</p>
                <p className="mt-2 leading-relaxed text-ink-2">{r.what}</p>
              </li>
            ))}
          </ul>
          <p className="mt-5 max-w-2xl leading-relaxed text-ink-2">
            Your activation link works for {activationLinkDays} days and can be used once. Open it
            in a normal browser tab on the computer you will use for setup.
          </p>
        </section>

        <section aria-labelledby="ready-title" className="mt-16">
          <SectionHeading
            id="ready-title"
            title="Have these ready"
            lead="In the order the setup asks for them."
          />
          <ol className="mt-8 space-y-6">
            {prepSections.map((s, i) => (
              <li key={s.id} className="rounded-xl border border-rule bg-surface p-7">
                <h3 className="font-display text-xl font-semibold text-ink">
                  <span className="text-accent">{i + 1}. </span>
                  {s.title}
                </h3>
                {s.required ? (
                  <p className="mt-2 text-sm font-semibold text-accent">{s.required}</p>
                ) : null}
                <ul className="mt-4 list-disc space-y-2 pl-5 leading-relaxed text-ink-2">
                  {s.items.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
                {s.columns ? (
                  <div className="mt-5">
                    <p className="text-sm font-semibold text-ink-2">{s.columns.label}</p>
                    <ul className="mt-2 flex flex-wrap gap-2">
                      {s.columns.headers.map((h) => (
                        <li
                          key={h}
                          className="rounded-md border border-rule bg-paper px-3 py-1.5 font-mono text-sm text-ink"
                        >
                          {h}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                {s.note ? <p className="mt-4 text-sm text-ink-muted">{s.note}</p> : null}
              </li>
            ))}
          </ol>
        </section>

        <section aria-labelledby="wizard-title" className="mt-16">
          <SectionHeading
            id="wizard-title"
            title="What the setup looks like"
            lead="Ten short steps. Only the academic session and at least one class are needed to finish; everything else can wait, though the sooner it is done, the sooner teachers can start writing questions."
          />
          <ol className="mt-8 flex flex-wrap gap-2">
            {wizardSteps.map((step, i) => (
              <li
                key={step}
                className="rounded-md border border-rule bg-surface px-3 py-1.5 text-sm text-ink-2"
              >
                <span className="font-semibold text-accent">{i + 1}</span> {step}
              </li>
            ))}
          </ol>
        </section>

        <section aria-labelledby="check-title" className="mt-16">
          <SectionHeading id="check-title" title="One-page checklist" />
          <ul className="mt-6 space-y-3">
            {checklist.map((c) => (
              <li key={c} className="flex items-start gap-3 text-ink-2">
                <span
                  aria-hidden="true"
                  className="mt-1 inline-block size-4 shrink-0 rounded-sm border-[1.5px] border-ink-muted/70"
                />
                {c}
              </li>
            ))}
          </ul>
        </section>

        <section
          aria-labelledby="help-title"
          className="mt-16 rounded-xl border border-rule bg-surface p-7"
        >
          <h2 id="help-title" className="font-display text-xl font-semibold text-ink">
            Stuck? Ask us.
          </h2>
          <p className="mt-2 leading-relaxed text-ink-2">
            We can go through the first steps with you.
            {site.email ? ` Write to ${site.email}` : ''}
            {whatsapp ? ' or message us on WhatsApp' : ''}
            {site.email || whatsapp ? '.' : ''}
          </p>
          {whatsapp ? (
            <a
              href={whatsapp}
              className="mt-3 inline-block font-semibold text-accent underline underline-offset-4"
            >
              Chat on WhatsApp
            </a>
          ) : null}
        </section>
      </Container>
    </>
  );
}
