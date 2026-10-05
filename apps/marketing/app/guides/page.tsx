import type { Metadata } from 'next';
import Link from 'next/link';
import { Container, PageHeader } from '@/components/ui';
import { guides } from '@/lib/guides';

export const metadata: Metadata = {
  title: 'Guides for running computer-based exams',
  description:
    'Practical guides for schools moving their exams to computers: planning sittings, preparing a CBT lab, and what changes for staff.',
  alternates: { canonical: '/guides' },
};

export default function GuidesPage() {
  return (
    <>
      <PageHeader
        eyebrow="Guides"
        title="Running exams on computers, in practice"
        lead="Written from what we learned building an exam platform for Nigerian school labs. Useful whichever platform you choose."
      />
      <Container className="py-16 sm:py-20">
        <ul className="grid gap-6 md:grid-cols-3">
          {guides.map((guide) => (
            <li key={guide.slug}>
              <article className="flex h-full flex-col rounded-xl border border-rule bg-surface p-7">
                <h2 className="font-display text-xl leading-snug font-semibold text-ink">
                  <Link href={`/guides/${guide.slug}`} className="hover:text-accent">
                    {guide.title}
                  </Link>
                </h2>
                <p className="mt-3 flex-1 leading-relaxed text-ink-2">{guide.description}</p>
                <p className="mt-5 text-sm text-ink-muted">{guide.minutes} minute read</p>
              </article>
            </li>
          ))}
        </ul>
      </Container>
    </>
  );
}
