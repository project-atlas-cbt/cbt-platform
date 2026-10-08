'use client';

import { ChangeOwnPasswordForm } from '@/components/account/change-own-password-form';
import { ErrorState } from '@/components/ui/error-state';
import { Skeleton } from '@/components/ui/skeleton';
import { useOwnStudentProfile } from '@/lib/account/queries';
import { useAuth } from '@/lib/auth';

/**
 * F14 — `04 §62` Profile. Read-only identity display plus a working
 * self-service password change (DoD item 7) — deliberately nothing more
 * ("Keep it simple... No unnecessary social/profile functionality," per
 * `04 §62`'s own text). `account.changeOwnProfile`'s own deferred
 * profile-*edit* endpoint gap (`awaitingResource`) is untouched by this
 * screen, which never edits name/class/department.
 */
export function StudentProfileScreen() {
  const query = useOwnStudentProfile();
  const { me } = useAuth();

  if (query.isPending) {
    return (
      <div className="max-w-md space-y-4">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  if (query.isError) {
    return (
      <ErrorState
        error={query.error}
        onRetry={() => void query.refetch()}
        title="Couldn't load your profile"
      />
    );
  }

  const profile = query.data;

  return (
    <div className="max-w-md space-y-8">
      <div>
        <h1 className="text-lg font-semibold text-text-primary">{profile.displayName}</h1>
        <dl className="mt-4 space-y-3 text-sm">
          <div className="flex justify-between gap-4">
            <dt className="text-text-muted">Student ID</dt>
            <dd className="font-medium text-text-primary">{profile.studentId}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-text-muted">Class</dt>
            <dd className="font-medium text-text-primary">
              {profile.currentClassName ?? 'Not yet enrolled'}
            </dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-text-muted">Department</dt>
            <dd className="font-medium text-text-primary">{profile.departmentName ?? '—'}</dd>
          </div>
        </dl>
      </div>

      <div className="border-t border-border pt-6">
        <h2 className="text-sm font-medium text-text-primary">Change password</h2>
        <div className="mt-4">
          {me?.passwordless ? (
            <p className="text-sm text-text-secondary">
              You signed in with your name and Login ID. To change your password, sign out and sign
              in with your password.
            </p>
          ) : (
            <ChangeOwnPasswordForm />
          )}
        </div>
      </div>
    </div>
  );
}
