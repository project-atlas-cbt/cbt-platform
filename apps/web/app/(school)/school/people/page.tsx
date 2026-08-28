import { redirect } from 'next/navigation';

/** `/school/people` has no content of its own — Students is the default section. */
export default function SchoolPeopleIndexPage() {
  redirect('/school/people/students');
}
