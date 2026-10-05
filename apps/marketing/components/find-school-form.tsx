import { site } from '@/lib/site';

export function FindSchoolForm() {
  return (
    <form action="/find-your-school/go" method="get" className="mt-8 max-w-xl">
      <label htmlFor="school" className="block font-semibold text-ink">
        Your school’s address
      </label>
      <div className="mt-2 flex flex-col gap-3 sm:flex-row">
        <div className="flex min-h-12 flex-1 items-center rounded-md border border-rule bg-surface pr-3 focus-within:border-accent focus-within:ring-2 focus-within:ring-accent/30">
          <input
            id="school"
            name="school"
            required
            maxLength={253}
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            placeholder="yourschool"
            aria-describedby="school-hint"
            className="min-w-0 flex-1 bg-transparent px-3 py-3 text-base text-ink focus:outline-none"
          />
          <span className="text-ink-muted">.{site.rootDomain}</span>
        </div>
        <button
          type="submit"
          className="inline-flex min-h-12 items-center justify-center rounded-md bg-accent px-6 text-[0.9375rem] font-semibold text-white hover:bg-accent-hover"
        >
          Go to sign-in
        </button>
      </div>
      <p id="school-hint" className="mt-3 text-sm leading-relaxed text-ink-muted">
        It’s the first part of the address in your activation email, or ask your school admin.
      </p>
    </form>
  );
}
