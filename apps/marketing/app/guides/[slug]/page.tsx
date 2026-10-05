import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { CtaBand } from '@/components/cta-band';
import { Container, JsonLd } from '@/components/ui';
import { guideBySlug, guides } from '@/lib/guides';
import { site } from '@/lib/site';

export const dynamicParams = false;

export function generateStaticParams() {
  return guides.map((guide) => ({ slug: guide.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const guide = guideBySlug((await params).slug);
  if (!guide) return {};
  return {
    title: guide.title,
    description: guide.description,
    alternates: { canonical: `/guides/${guide.slug}` },
    openGraph: {
      type: 'article',
      title: guide.title,
      description: guide.description,
      publishedTime: guide.published,
    },
  };
}

export default async function GuidePage({ params }: { params: Promise<{ slug: string }> }) {
  const guide = guideBySlug((await params).slug);
  if (!guide) notFound();
  const date = new Date(`${guide.published}T00:00:00Z`).toLocaleDateString('en-NG', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });

  return (
    <>
      <JsonLd
        data={{
          '@context': 'https://schema.org',
          '@type': 'Article',
          headline: guide.title,
          description: guide.description,
          datePublished: guide.published,
          author: { '@type': 'Organization', name: site.name },
          publisher: { '@type': 'Organization', name: site.name },
          mainEntityOfPage: `${site.url}/guides/${guide.slug}`,
        }}
      />
      <article>
        <header className="border-b border-rule bg-surface">
          <Container className="max-w-3xl py-14 sm:py-20">
            <nav aria-label="Breadcrumb" className="text-sm text-ink-muted">
              <Link href="/guides" className="hover:text-ink">
                Guides
              </Link>
            </nav>
            <h1 className="mt-4 font-display text-4xl leading-[1.15] font-semibold tracking-tight text-ink sm:text-[2.75rem]">
              {guide.title}
            </h1>
            <p className="mt-5 text-lg leading-relaxed text-ink-2">{guide.description}</p>
            <p className="mt-6 text-sm text-ink-muted">
              <time dateTime={guide.published}>{date}</time> · {guide.minutes} minute read
            </p>
          </Container>
        </header>
        <Container className="max-w-3xl py-12 sm:py-16">
          <div className="prose-guide">{guide.body({ name: site.name })}</div>
        </Container>
      </article>
      <CtaBand />
    </>
  );
}
