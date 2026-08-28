import { redirect } from 'next/navigation';

/** `/school/settings` has no content of its own — Profile is the default section. */
export default function SchoolSettingsIndexPage() {
  redirect('/school/settings/profile');
}
