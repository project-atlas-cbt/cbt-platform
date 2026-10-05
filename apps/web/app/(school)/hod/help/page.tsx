'use client';

import { HelpCentreScreen } from '@/components/help/help-centre-screen';
import { HOD_GUIDES } from '@/lib/help/guides/hod';

/** ADR-0035 — imports only this role's guides, so no other role's guides ship here. */
export default function HodHelpPage() {
  return <HelpCentreScreen set={HOD_GUIDES} />;
}
