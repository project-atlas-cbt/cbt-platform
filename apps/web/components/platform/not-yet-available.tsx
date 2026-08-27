import type { LucideIcon } from 'lucide-react';
import { EmptyState } from '@/components/ui/empty-state';

/**
 * A specific, permanent "not yet available" state naming what unlocks it —
 * mirroring `NotificationPanel`'s (F2) established precedent, not the
 * generic `WorkspacePlaceholder` catch-all copy ("hasn't been built yet"),
 * since the chrome here *is* built now; only the backend data source is
 * pending. Used by School Detail's Users/Exams/Activity/Audit tabs and the
 * platform Analytics/Audit screens.
 */
export function NotYetAvailable({
  icon,
  title,
  description,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
}) {
  return <EmptyState icon={icon} title={title} description={description} className="mt-2" />;
}
