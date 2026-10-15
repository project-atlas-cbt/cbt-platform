import { site, whatsappLink } from '@/lib/site';
import { CallBackForm } from './call-back-form';
import { ButtonLink, Container } from './ui';

export function CtaBand({
  title = 'See it with your own exams in mind',
  body = 'We’ll walk you through a sitting from start to published result, and answer the questions your staff will ask.',
}: {
  title?: string;
  body?: string;
}) {
  const whatsapp = whatsappLink(
    site,
    `Hello, I'd like to know more about ${site.name} for my school.`,
  );
  return (
    <section aria-labelledby="cta-title" className="ruled border-t border-rule">
      <Container className="py-16 sm:py-20">
        <div className="margin-rule max-w-3xl pl-6 sm:pl-9">
          <h2
            id="cta-title"
            className="font-display text-3xl leading-tight font-semibold tracking-tight text-ink sm:text-4xl"
          >
            {title}
          </h2>
          <p className="mt-4 text-lg leading-relaxed text-ink-2">{body}</p>
          <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-3">
            <ButtonLink href="/request-a-demo">Request a demo</ButtonLink>
            {whatsapp ? (
              <a
                href={whatsapp}
                rel="noopener"
                className="inline-flex min-h-11 items-center rounded-md border border-rule bg-surface px-5 text-[0.9375rem] font-semibold text-ink hover:border-ink-muted"
              >
                Chat on WhatsApp
              </a>
            ) : null}
          </div>
          <div className="mt-10 max-w-2xl">
            <CallBackForm />
          </div>
        </div>
      </Container>
    </section>
  );
}
