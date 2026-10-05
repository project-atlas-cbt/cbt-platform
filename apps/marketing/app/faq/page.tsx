import type { Metadata } from 'next';
import { CtaBand } from '@/components/cta-band';
import { Container, JsonLd, PageHeader } from '@/components/ui';
import { faqs } from '@/lib/content';
import { site } from '@/lib/site';

export const metadata: Metadata = {
  title: 'Frequently asked questions',
  description: `Answers about buying, setting up and running exams with ${site.name}: connectivity, lab computers, question types, results and data.`,
  alternates: { canonical: '/faq' },
};

function slug(text: string) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

export default function FaqPage() {
  return (
    <>
      <JsonLd
        data={{
          '@context': 'https://schema.org',
          '@type': 'FAQPage',
          mainEntity: faqs.flatMap((group) =>
            group.items.map((item) => ({
              '@type': 'Question',
              name: item.q,
              acceptedAnswer: { '@type': 'Answer', text: item.a },
            })),
          ),
        }}
      />
      <PageHeader
        eyebrow="FAQ"
        title="Questions schools ask us"
        lead="If your question isn’t here, ask it when you request a demo. We’d rather answer it before you buy than after."
      />

      <Container className="grid gap-12 py-16 sm:py-20 lg:grid-cols-[14rem_1fr]">
        <nav aria-label="Topics" className="lg:sticky lg:top-24 lg:self-start">
          <ul className="flex flex-wrap gap-2 lg:flex-col lg:gap-1">
            {faqs.map((group) => (
              <li key={group.group}>
                <a
                  href={`#${slug(group.group)}`}
                  className="inline-block rounded px-2 py-1.5 text-[0.9375rem] text-ink-2 hover:bg-surface-muted hover:text-ink"
                >
                  {group.group}
                </a>
              </li>
            ))}
          </ul>
        </nav>
        <div className="space-y-14">
          {faqs.map((group) => (
            <section
              key={group.group}
              id={slug(group.group)}
              aria-labelledby={`${slug(group.group)}-title`}
            >
              <h2
                id={`${slug(group.group)}-title`}
                className="font-display text-2xl font-semibold text-ink"
              >
                {group.group}
              </h2>
              <div className="mt-5 divide-y divide-rule border-y border-rule">
                {group.items.map((item) => (
                  <details key={item.q} className="group py-1">
                    <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-4 py-3 font-semibold text-ink [&::-webkit-details-marker]:hidden">
                      {item.q}
                      <span
                        aria-hidden="true"
                        className="text-xl leading-none text-ink-muted transition-transform group-open:rotate-45"
                      >
                        +
                      </span>
                    </summary>
                    <p className="pb-5 leading-relaxed text-ink-2">{item.a}</p>
                  </details>
                ))}
              </div>
            </section>
          ))}
        </div>
      </Container>

      <CtaBand
        title="Still have a question?"
        body="Ask it in a demo, with your own exams and lab in mind."
      />
    </>
  );
}
