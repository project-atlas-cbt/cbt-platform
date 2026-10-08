'use client';

import { useState } from 'react';
import { Plus, X } from 'lucide-react';
import { describeRule } from '@atlas/domain';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/ui/error-state';
import { useHasPermission } from '@/lib/nav';
import { useSubjectChoiceGroups, useSubjects } from '@/lib/academics/queries';
import { useCreateChoiceGroup, useDeleteChoiceGroup } from '@/lib/academics/mutations';
import { ApiError } from '@/lib/api';
import { ConfirmActionDialog } from '../confirm-action-dialog';

/**
 * ADR-0038 — subject choice groups on the Subjects screen. A group is a
 * "choose between min and max of these" rule (Religion: CRS or IRS, choose
 * 1). Subjects join a group from their own Edit form. The rule only warns on
 * the class subject grid; it never stops a save.
 */
export function ChoiceGroupsPanel() {
  const groups = useSubjectChoiceGroups();
  const subjects = useSubjects();
  const canManage = useHasPermission('schoolConfig.subject.manage');
  const createGroup = useCreateChoiceGroup();
  const deleteGroup = useDeleteChoiceGroup();
  const [name, setName] = useState('');
  const [minChoices, setMinChoices] = useState('1');
  const [maxChoices, setMaxChoices] = useState('1');
  const [error, setError] = useState<string | null>(null);
  const [removing, setRemoving] = useState<{ id: string; name: string } | null>(null);

  if (groups.isPending) return <Skeleton className="h-24 w-full" />;
  if (groups.isError)
    return <ErrorState error={groups.error} onRetry={() => void groups.refetch()} />;

  const subjectName = (id: string) => subjects.data?.subjects.find((s) => s.id === id)?.name ?? '';
  const list = groups.data.choiceGroups;

  async function handleCreate() {
    setError(null);
    const min = Number(minChoices);
    const max = Number(maxChoices);
    if (!name.trim()) return setError('Enter a name, e.g. "Religion".');
    if (!Number.isInteger(min) || !Number.isInteger(max) || min < 0 || max < 1 || min > max)
      return setError(
        'Choose at least 0 and at most 1 or more, with the minimum not above the maximum.',
      );
    try {
      await createGroup.mutateAsync({ name: name.trim(), minChoices: min, maxChoices: max });
      setName('');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not create the choice group.');
    }
  }

  return (
    <section className="space-y-3 pt-2" aria-labelledby="choice-groups-heading">
      <div>
        <h3 id="choice-groups-heading" className="text-sm font-semibold text-text-primary">
          Choice groups
        </h3>
        <p className="text-sm text-text-secondary">
          For subjects students choose between, such as CRS or IRS, or one trade subject. Add a
          subject to a group from its Edit form.
        </p>
      </div>

      {list.length === 0 ? (
        <p className="text-sm text-text-muted">No choice groups yet.</p>
      ) : (
        <ul className="divide-y divide-border rounded-md border border-border">
          {list.map((g) => (
            <li key={g.id} className="flex items-center justify-between gap-3 px-4 py-2 text-sm">
              <span>
                <span className="font-medium text-text-primary">{g.name}</span>{' '}
                <span className="text-text-secondary">
                  ({describeRule(g.minChoices, g.maxChoices)})
                </span>
                <span className="block text-text-muted">
                  {g.subjectIds.length === 0
                    ? 'No subjects in this group yet.'
                    : g.subjectIds.map(subjectName).join(', ')}
                </span>
              </span>
              {canManage ? (
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label={`Delete ${g.name}`}
                  onClick={() => setRemoving({ id: g.id, name: g.name })}
                >
                  <X aria-hidden />
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      {canManage ? (
        <div className="flex flex-wrap items-end gap-2">
          <div className="space-y-1">
            <Label htmlFor="choice-group-name">Name</Label>
            <Input
              id="choice-group-name"
              className="w-48"
              placeholder="Religion"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="choice-group-min">At least</Label>
            <Input
              id="choice-group-min"
              className="w-20"
              type="number"
              inputMode="numeric"
              min={0}
              value={minChoices}
              onChange={(e) => setMinChoices(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="choice-group-max">At most</Label>
            <Input
              id="choice-group-max"
              className="w-20"
              type="number"
              inputMode="numeric"
              min={1}
              value={maxChoices}
              onChange={(e) => setMaxChoices(e.target.value)}
            />
          </div>
          <Button
            variant="secondary"
            loading={createGroup.isPending}
            onClick={() => void handleCreate()}
          >
            <Plus aria-hidden /> Add choice group
          </Button>
        </div>
      ) : null}
      {error ? (
        <p role="alert" className="text-sm font-medium text-danger">
          {error}
        </p>
      ) : null}

      <ConfirmActionDialog
        open={removing !== null}
        onOpenChange={(open) => !open && setRemoving(null)}
        title={`Delete the "${removing?.name}" choice group?`}
        body="A group can be deleted only once no subject is in it. Registrations don't change."
        confirmLabel="Delete"
        destructive
        onConfirm={async () => {
          if (removing) await deleteGroup.mutateAsync(removing.id);
        }}
      />
    </section>
  );
}
