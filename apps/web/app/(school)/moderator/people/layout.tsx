import type { ReactNode } from 'react';
import { PeopleTabs } from '@/components/people/people-tabs';

export default function ModeratorPeopleLayout({ children }: { children: ReactNode }) {
  return (
    <div className="space-y-4">
      <h1 className="text-lg font-semibold text-text-primary">People</h1>
      <PeopleTabs basePath="/moderator/people" />
      <div className="pt-2">{children}</div>
    </div>
  );
}
