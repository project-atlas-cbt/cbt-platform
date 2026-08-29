import { ImportScreen } from '@/components/imports/import-screen';

export default function SchoolPeopleTeachersImportPage() {
  return (
    <ImportScreen
      type="TEACHERS"
      permission="users.import.teachers"
      title="Import teachers"
      backHref="/school/people/teachers"
      backLabel="Back to Teachers"
    />
  );
}
