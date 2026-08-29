import { ImportScreen } from '@/components/imports/import-screen';

export default function ModeratorPeopleTeachersImportPage() {
  return (
    <ImportScreen
      type="TEACHERS"
      permission="users.import.teachers"
      title="Import teachers"
      backHref="/moderator/people/teachers"
      backLabel="Back to Teachers"
    />
  );
}
