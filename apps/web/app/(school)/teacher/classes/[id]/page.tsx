import { redirect } from 'next/navigation';

interface ClassesIdRedirectProps {
  params: Promise<{ id: string }>;
}

export default async function TeacherClassIdRedirectPage({ params }: ClassesIdRedirectProps) {
  const { id } = await params;
  redirect(`/teacher/my-classes/${id}`);
}
