'use client';

import Link from 'next/link';
import { useEffect, useRef } from 'react';
import { primaryNav } from '@/lib/nav';
import { ButtonLink, Container } from './ui';

/** Native disclosure for small screens; script only adds outside-tap, Escape and link-click close. */
export function MobileMenu() {
  const ref = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    const close = () => {
      if (ref.current) ref.current.open = false;
    };
    const onPointerDown = (event: PointerEvent) => {
      const el = ref.current;
      if (el?.open && event.target instanceof Node && !el.contains(event.target)) close();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close();
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, []);

  return (
    <details
      ref={ref}
      className="group lg:hidden"
      onClick={(event) => {
        if (event.target instanceof Element && event.target.closest('a') && ref.current) {
          ref.current.open = false;
        }
      }}
    >
      <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 rounded-md border border-rule bg-surface px-3 text-sm font-semibold text-ink [&::-webkit-details-marker]:hidden">
        <span className="group-open:hidden">Menu</span>
        <span className="hidden group-open:inline">Close</span>
      </summary>
      <nav
        aria-label="Main"
        className="absolute inset-x-0 top-16 border-b border-rule bg-surface shadow-[0_12px_24px_-12px_rgb(20_22_27/0.18)]"
      >
        <Container className="py-4">
          <ul className="divide-y divide-rule text-base">
            {primaryNav.map((item) => (
              <li key={item.href}>
                <Link href={item.href} className="block py-3 text-ink">
                  {item.label}
                </Link>
              </li>
            ))}
            <li>
              <Link href="/find-your-school" className="block py-3 text-ink">
                School sign-in
              </Link>
            </li>
          </ul>
          <ButtonLink href="/request-a-demo" className="mt-4 w-full">
            Request a demo
          </ButtonLink>
        </Container>
      </nav>
    </details>
  );
}
