import { ImportScreen } from '@/components/imports/import-screen';

export default function ModeratorPeopleStudentsImportPage() {
  return (
    <ImportScreen
      type="STUDENTS"
      permission="users.import.students"
      title="Import students"
      backHref="/moderator/people/students"
      backLabel="Back to Students"
    />
  );
}
