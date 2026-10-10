import type { ReactNode } from 'react';

export interface AuthCardProps {
  eyebrow?: ReactNode;
  title: string;
  description?: string;
  /** Below the form, at the foot of the page (the school sign-in's "Powered by" credit). */
  footer?: ReactNode;
  children: ReactNode;
}

/**
 * Shared shell for every F1 auth screen (login, forgot/reset password,
 * forced change) — doctrine §7's "consistent label placement... across
 * every form in the product" applies just as much between auth screens as
 * within one. Deliberately plain: no card shadow/decoration (doctrine §7
 * "Shadows": reserve elevation for things that are actually elevated) —
 * this is a full-page task, not a panel floating over other content.
 */
export function AuthCard({ eyebrow, title, description, footer, children }: AuthCardProps) {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-6 py-12">
      <div className="w-full max-w-sm space-y-6">
        <div className="space-y-1 text-center">
          {eyebrow}
          <h1 className="text-xl font-semibold text-text-primary">{title}</h1>
          {description ? <p className="text-sm text-text-secondary">{description}</p> : null}
        </div>
        {children}
      </div>
      {footer ? <div className="mt-12">{footer}</div> : null}
    </main>
  );
}
