import { redirect } from 'next/navigation';

/** `/school/academics` has no content of its own — Sessions is the default section. */
export default function SchoolAcademicsIndexPage() {
  redirect('/school/academics/sessions');
}
