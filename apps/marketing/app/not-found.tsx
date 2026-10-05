import { ButtonLink, PageHeader } from '@/components/ui';

export default function NotFound() {
  return (
    <PageHeader
      eyebrow="Page not found"
      title="There’s no page at this address"
      lead="It may have moved, or the link may be mistyped. If you were looking for your school’s sign-in, it lives at your school’s own address."
    >
      <div className="mt-8 flex flex-wrap gap-3">
        <ButtonLink href="/">Go to the home page</ButtonLink>
        <ButtonLink href="/find-your-school" variant="secondary">
          Find your school
        </ButtonLink>
      </div>
    </PageHeader>
  );
}
