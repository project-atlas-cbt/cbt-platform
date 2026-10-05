import Link from 'next/link';
import type { ComponentProps, ReactNode } from 'react';

export function Container({
  className = '',
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={`mx-auto w-full max-w-6xl px-4 sm:px-6 lg:px-8 ${className}`}>{children}</div>
  );
}

type ButtonProps = ComponentProps<typeof Link> & { variant?: 'primary' | 'secondary' | 'quiet' };

const buttonStyles = {
  primary:
    'bg-accent text-white hover:bg-accent-hover shadow-[0_1px_0_rgb(0_0_0/0.08)] border border-transparent',
  secondary: 'bg-surface text-ink border border-rule hover:border-ink-muted',
  quiet: 'text-accent hover:text-accent-hover underline underline-offset-4',
};

export function ButtonLink({ variant = 'primary', className = '', ...props }: ButtonProps) {
  const shape =
    variant === 'quiet' ? 'min-h-11 rounded-sm' : 'min-h-11 justify-center rounded-md px-5';
  return (
    <Link
      {...props}
      className={`inline-flex items-center gap-2 text-[0.9375rem] font-semibold transition-colors ${shape} ${buttonStyles[variant]} ${className}`}
    />
  );
}

/** A page's opening block. The margin rule ties every page to the home page's exercise-book hero. */
export function PageHeader({
  eyebrow,
  title,
  lead,
  children,
}: {
  eyebrow: string;
  title: string;
  lead: string;
  children?: ReactNode;
}) {
  return (
    <header className="border-b border-rule bg-surface">
      <Container className="py-14 sm:py-20">
        <div className="margin-rule pl-6 sm:pl-8">
          <p className="text-sm font-semibold text-accent">{eyebrow}</p>
          <h1 className="mt-3 max-w-3xl font-display text-4xl leading-[1.12] font-semibold tracking-tight text-ink sm:text-5xl">
            {title}
          </h1>
          <p className="mt-5 max-w-2xl text-lg leading-relaxed text-ink-2">{lead}</p>
          {children}
        </div>
      </Container>
    </header>
  );
}

export function SectionHeading({
  eyebrow,
  title,
  lead,
  id,
}: {
  eyebrow?: string;
  title: string;
  lead?: string;
  id?: string;
}) {
  return (
    <div className="max-w-2xl">
      {eyebrow ? <p className="text-sm font-semibold text-accent">{eyebrow}</p> : null}
      <h2
        id={id}
        className="mt-2 font-display text-3xl leading-tight font-semibold tracking-tight text-ink sm:text-[2.25rem]"
      >
        {title}
      </h2>
      {lead ? <p className="mt-4 text-lg leading-relaxed text-ink-2">{lead}</p> : null}
    </div>
  );
}

/** The answer-sheet option circle, A to D. A filled circle is the chosen answer. */
export function OptionBubble({ letter, filled = false }: { letter: string; filled?: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={`inline-flex size-7 shrink-0 items-center justify-center rounded-full border-[1.5px] text-xs font-semibold ${
        filled ? 'border-accent bg-accent text-white' : 'border-ink-muted/60 text-ink-muted'
      }`}
    >
      {letter}
    </span>
  );
}

export function Tick({ className = '' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 20 20"
      aria-hidden="true"
      className={`size-5 shrink-0 text-tick ${className}`}
    >
      <path
        d="M4 10.5l3.6 3.6L16 5.8"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function JsonLd({ data }: { data: object }) {
  return (
    <script
      type="application/ld+json"
      // JSON.stringify output with "<" escaped cannot close the script element.
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, '\\u003c') }}
    />
  );
}
