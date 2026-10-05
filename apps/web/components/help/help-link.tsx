'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { CircleHelp } from 'lucide-react';
import type { Role } from '@atlas/domain';
import { ROLE_WORKSPACES } from '@/lib/nav/nav-model';
import { CONTEXTUAL_GUIDES, type HelpContext } from '@/lib/help/contextual';
import { cn } from '@/lib/utils';

function workspaceRole(pathname: string | null): Role | null {
  if (!pathname) return null;
  for (const workspace of Object.values(ROLE_WORKSPACES)) {
    if (pathname === workspace.root || pathname.startsWith(`${workspace.root}/`)) {
      return workspace.role;
    }
  }
  return null;
}

/**
 * ADR-0035 decision 5: a small link from a working screen to the guide for
 * it. The role comes from the workspace the screen is shown in, so shared
 * screens (the Control Center, results) link to their own role's guide. It
 * carries only the guide id, never guide content, so no screen pulls a
 * role's guides into its bundle.
 */
export function HelpLink({ context, className }: { context: HelpContext; className?: string }) {
  const pathname = usePathname();
  const entry = CONTEXTUAL_GUIDES[context];
  const role = workspaceRole(pathname);
  if (!role || !(entry.roles as readonly Role[]).includes(role)) return null;

  return (
    <Link
      href={`${ROLE_WORKSPACES[role].root}/help/${entry.guideId}`}
      aria-label={`Help: ${entry.topic}`}
      className={cn(
        'inline-flex shrink-0 items-center gap-1 text-sm text-text-secondary underline-offset-2 hover:text-brand-primary hover:underline',
        className,
      )}
    >
      <CircleHelp className="size-4" aria-hidden />
      Help
    </Link>
  );
}
