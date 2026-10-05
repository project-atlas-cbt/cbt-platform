'use client';

import { HelpCentreScreen } from '@/components/help/help-centre-screen';
import { TEACHER_GUIDES } from '@/lib/help/guides/teacher';

/** ADR-0035 — imports only this role's guides, so no other role's guides ship here. */
export default function TeacherHelpPage() {
  return <HelpCentreScreen set={TEACHER_GUIDES} />;
}
