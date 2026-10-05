'use client';

import { HelpCentreScreen } from '@/components/help/help-centre-screen';
import { SCHOOL_ADMIN_GUIDES } from '@/lib/help/guides/school-admin';

/** ADR-0035 — imports only this role's guides, so no other role's guides ship here. */
export default function SchoolAdminHelpPage() {
  return <HelpCentreScreen set={SCHOOL_ADMIN_GUIDES} />;
}
