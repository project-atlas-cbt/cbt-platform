'use client';

import { useMemo, useState } from 'react';
import { Mail, RotateCcw } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ErrorState } from '@/components/ui/error-state';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { ReasonDialog } from '@/components/platform/reason-dialog';
import { ApiError } from '@/lib/api/error';
import { formatDateTime } from '@/lib/format/date';
import {
  describeValue,
  limitsText,
  parseDraft,
  toDraft,
  usePlatformSettings,
  useSendTestEmail,
  useUpdatePlatformSettings,
  type PlatformSetting,
  type PlatformSettingChange,
  type PlatformSettingKey,
} from '@/lib/platform/settings';

const GROUPS: { id: PlatformSetting['group']; title: string; description: string }[] = [
  {
    id: 'operations',
    title: 'Email and alerts',
    description: 'Who hears about problems, and how platform email is signed.',
  },
  {
    id: 'sign-in',
    title: 'Sign-in',
    description:
      'Session lengths apply to new sign-ins. Idle sign-out and lockout rules apply at once.',
  },
];

const TRANSPORT_LABEL = { smtp: 'SMTP', ses: 'Amazon SES', console: 'Console (no email sent)' };

function timeZones(): string[] {
  try {
    return Intl.supportedValuesOf('timeZone');
  } catch {
    return [];
  }
}

function SettingField({
  setting,
  draft,
  error,
  onChange,
  onReset,
}: {
  setting: PlatformSetting;
  draft: string;
  error: string | undefined;
  onChange: (draft: string) => void;
  onReset: () => void;
}) {
  const id = `setting-${setting.key}`;
  const helpId = `${id}-help`;
  const errorId = `${id}-error`;
  const limits = limitsText(setting);
  const describedBy = [helpId, error ? errorId : null].filter(Boolean).join(' ');

  return (
    <div className="grid gap-x-8 gap-y-2 border-t border-border py-5 first:border-t-0 md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
      <div className="space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <Label htmlFor={id} className="text-sm font-medium text-text-primary">
            {setting.label}
          </Label>
          {setting.overridden ? <Badge status="info">Changed</Badge> : null}
        </div>
        <p id={helpId} className="text-sm text-text-muted">
          {setting.description}
          {limits ? ` ${limits}` : ''}
        </p>
      </div>
      <div className="space-y-2">
        {setting.kind === 'emailList' ? (
          <Textarea
            id={id}
            rows={3}
            value={draft}
            onChange={(e) => onChange(e.target.value)}
            aria-describedby={describedBy}
            aria-invalid={error ? true : undefined}
            placeholder="One address per line"
            spellCheck={false}
          />
        ) : setting.kind === 'duration' || setting.kind === 'count' ? (
          <div className="flex items-center gap-2">
            <Input
              id={id}
              type="number"
              inputMode="numeric"
              className="max-w-32 tabular-nums"
              value={draft}
              onChange={(e) => onChange(e.target.value)}
              aria-describedby={describedBy}
              aria-invalid={error ? true : undefined}
            />
            {setting.unit ? (
              <span className="text-sm text-text-secondary">{setting.unit}</span>
            ) : null}
          </div>
        ) : (
          <Input
            id={id}
            type={setting.kind === 'email' ? 'email' : 'text'}
            value={draft}
            onChange={(e) => onChange(e.target.value)}
            aria-describedby={describedBy}
            aria-invalid={error ? true : undefined}
            spellCheck={false}
            list={setting.kind === 'timezone' ? 'platform-timezones' : undefined}
            autoComplete="off"
          />
        )}
        {error ? (
          <p id={errorId} role="alert" className="text-sm font-medium text-danger">
            {error}
          </p>
        ) : null}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-text-muted">
          <span>
            Default: {describeValue(setting, setting.defaultValue)}
            {setting.envKey ? (
              <>
                {' '}
                (<code className="font-mono">{setting.envKey}</code>)
              </>
            ) : null}
          </span>
          {setting.overridden && setting.updatedAt ? (
            <span>
              Changed by {setting.updatedBy ?? 'a Software Admin'} on{' '}
              {formatDateTime(setting.updatedAt)}
            </span>
          ) : null}
          {setting.overridden ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onReset}
              aria-label={`Reset ${setting.label} to default`}
            >
              <RotateCcw aria-hidden /> Reset to default
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function TestEmailSection({ transport }: { transport: keyof typeof TRANSPORT_LABEL }) {
  const send = useSendTestEmail();
  return (
    <section aria-labelledby="test-email" className="space-y-3 rounded-md border border-border p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 id="test-email" className="text-sm font-semibold text-text-primary">
            Check email
          </h2>
          <p className="text-sm text-text-muted">
            Sends a test email to you from the saved sender, through {TRANSPORT_LABEL[transport]}.
            Do this after changing the sender.
          </p>
        </div>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          loading={send.isPending}
          onClick={() => send.mutate()}
        >
          <Mail aria-hidden /> Send test email
        </Button>
      </div>
      {send.isSuccess ? (
        <p role="status" className="text-sm text-success">
          Sent to {send.data.sentTo}. Check that inbox, including spam.
        </p>
      ) : null}
      {send.isError ? <ErrorState error={send.error} title="The test email was not sent" /> : null}
    </section>
  );
}

/**
 * ADR-0036 — `/admin/settings`: the editable platform settings, grouped,
 * each showing its default and who changed it. Saving asks for a reason
 * (audited, and emailed to the other Software Admins); "Reset to default"
 * does the same for one setting. Never optimistic: the fields reload from
 * what the server saved.
 */
export function SystemConfigurationScreen() {
  const query = usePlatformSettings();
  const update = useUpdatePlatformSettings();
  const [drafts, setDrafts] = useState<Partial<Record<PlatformSettingKey, string>>>({});
  const [errors, setErrors] = useState<Partial<Record<PlatformSettingKey, string>>>({});
  const [pending, setPending] = useState<{
    title: string;
    changes: PlatformSettingChange[];
  } | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const zones = useMemo(() => timeZones(), []);

  // Re-seed the fields whenever the server's settings change (first load,
  // after a save) — React's "adjust state on prop change" pattern.
  const settings = query.data?.settings;
  const [seededFrom, setSeededFrom] = useState<typeof settings>(undefined);
  if (settings && settings !== seededFrom) {
    setSeededFrom(settings);
    setDrafts(Object.fromEntries(settings.map((s) => [s.key, toDraft(s, s.value)])));
  }

  if (query.isPending) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-72" />
        <Skeleton className="h-64 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }
  if (query.isError) {
    return <ErrorState error={query.error} onRetry={() => void query.refetch()} />;
  }

  const all = query.data.settings;
  const dirty = all.filter((s) => (drafts[s.key] ?? '') !== toDraft(s, s.value));

  function review() {
    setSaved(null);
    const nextErrors: Partial<Record<PlatformSettingKey, string>> = {};
    const changes: PlatformSettingChange[] = [];
    for (const setting of dirty) {
      const parsed = parseDraft(setting, drafts[setting.key] ?? '');
      if (parsed.ok) changes.push({ key: setting.key, value: parsed.value });
      else nextErrors[setting.key] = parsed.message;
    }
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length === 0 && changes.length > 0) {
      setPending({
        title: `Save ${changes.length} ${changes.length === 1 ? 'change' : 'changes'}?`,
        changes,
      });
    }
  }

  async function confirm(reason: string) {
    if (!pending) return;
    try {
      await update.mutateAsync({ changes: pending.changes, reason });
      setErrors({});
      setSaved(
        `Saved. ${pending.changes.length === 1 ? 'The change applies' : 'The changes apply'} within 30 seconds.`,
      );
    } catch (err) {
      const fields = err instanceof ApiError ? err.details?.['fields'] : undefined;
      if (fields && typeof fields === 'object') {
        // Shown beside each field; the dialog closes so they can be fixed.
        setErrors(fields);
        return;
      }
      throw err;
    }
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-lg font-semibold text-text-primary">System Configuration</h1>
        <p className="max-w-prose text-sm text-text-muted">
          Platform-wide settings. Each change needs a reason, goes into the audit log and is emailed
          to the other Software Admins. Secrets, server addresses and exam rules stay in the
          server&apos;s environment file.
        </p>
      </div>

      <datalist id="platform-timezones">
        {zones.map((zone) => (
          <option key={zone} value={zone} />
        ))}
      </datalist>

      <form
        onSubmit={(event) => {
          event.preventDefault();
          review();
        }}
        noValidate
        className="space-y-8"
      >
        {GROUPS.map((group) => (
          <section key={group.id} aria-labelledby={`group-${group.id}`} className="space-y-1">
            <h2 id={`group-${group.id}`} className="text-sm font-semibold text-text-primary">
              {group.title}
            </h2>
            <p className="text-sm text-text-muted">{group.description}</p>
            <div className="mt-3 rounded-md border border-border px-5">
              {all
                .filter((s) => s.group === group.id)
                .map((setting) => (
                  <SettingField
                    key={setting.key}
                    setting={setting}
                    draft={drafts[setting.key] ?? ''}
                    error={errors[setting.key]}
                    onChange={(draft) => {
                      setSaved(null);
                      setDrafts((d) => ({ ...d, [setting.key]: draft }));
                    }}
                    onReset={() =>
                      setPending({
                        title: `Reset ${setting.label.toLowerCase()} to its default?`,
                        changes: [{ key: setting.key, value: null }],
                      })
                    }
                  />
                ))}
            </div>
          </section>
        ))}

        <div className="sticky bottom-0 flex flex-wrap items-center gap-3 border-t border-border bg-background py-4">
          <Button type="submit" disabled={dirty.length === 0}>
            Save changes
          </Button>
          {dirty.length > 0 ? (
            <>
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setErrors({});
                  setDrafts(Object.fromEntries(all.map((s) => [s.key, toDraft(s, s.value)])));
                }}
              >
                Discard
              </Button>
              <span className="text-sm text-text-secondary">
                {dirty.length} unsaved {dirty.length === 1 ? 'change' : 'changes'}
              </span>
            </>
          ) : null}
          {saved ? (
            <p role="status" className="text-sm text-success">
              {saved}
            </p>
          ) : null}
        </div>
      </form>

      <TestEmailSection transport={query.data.environment.emailTransport} />

      <p className="text-xs text-text-muted">Release {query.data.environment.releaseVersion}</p>

      <ReasonDialog
        open={pending !== null}
        onOpenChange={(open) => {
          if (!open) setPending(null);
        }}
        title={pending?.title ?? ''}
        description={
          pending
            ? pending.changes
                .map((c) => {
                  const s = all.find((x) => x.key === c.key)!;
                  return `${s.label}: ${describeValue(s, s.value)} → ${
                    c.value === null ? describeValue(s, s.defaultValue) : describeValue(s, c.value)
                  }`;
                })
                .join('. ')
            : ''
        }
        confirmLabel="Save"
        onConfirm={confirm}
      />
    </div>
  );
}
