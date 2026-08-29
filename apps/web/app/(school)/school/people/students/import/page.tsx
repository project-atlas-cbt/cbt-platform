import { ImportScreen } from '@/components/imports/import-screen';

export default function SchoolPeopleStudentsImportPage() {
  return (
    <ImportScreen
      type="STUDENTS"
      permission="users.import.students"
      title="Import students"
      backHref="/school/people/students"
      backLabel="Back to Students"
    />
  );
}
