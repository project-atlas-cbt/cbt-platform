'use client';

import { HelpCentreScreen } from '@/components/help/help-centre-screen';
import { MODERATOR_GUIDES } from '@/lib/help/guides/moderator';

/** ADR-0035 — imports only this role's guides, so no other role's guides ship here. */
export default function ModeratorHelpPage() {
  return <HelpCentreScreen set={MODERATOR_GUIDES} />;
}
