'use client';

import { useState, type ReactNode } from 'react';
import { Copy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useResetStudentCredentials } from '@/lib/people/mutations';
import { describeAcademicsError } from '@/components/academics/error-utils';

/**
 * The one-time plaintext reveal itself — shared with `StudentForm`'s
 * post-creation flow (a gap-closure found via live testing: individual
 * student creation never issued a password at all, leaving the admin with
 * a login ID and no way to discover one; it now auto-issues credentials
 * immediately after creation and shows them through this exact panel,
 * rather than a second, differently-worded copy of the same markup).
 */
/**
 * `navigator.clipboard` is only defined in a "secure context" (HTTPS, or
 * `localhost` exactly) per the Clipboard API spec — this project's own
 * local-dev convention serves every school over plain HTTP on a
 * `*.localtest.me` subdomain (`domain-plan.md`), which is neither, so
 * `navigator.clipboard` is `undefined` there and a bare `.writeText(...)`
 * call throws `Cannot read properties of undefined`. A real runtime crash
 * found via live testing (pre-existing in this markup before it was
 * extracted into this shared component — surfaced far more often once
 * `StudentForm`'s auto-reveal-on-create put this panel in front of the
 * admin after every single student creation, not just an explicit "Reset
 * credentials" click). Guarded, not merely wrapped: the API's *absence* is
 * the common case here (every local-dev session), not an edge case —
 * `document.execCommand('copy')` (deprecated but still broadly supported,
 * and this project's own tested browser matrix includes exactly the older/
 * non-secure-context case this exists for) is the fallback, with the
 * plaintext already visible in the DOM for manual selection as the final
 * fallback either way.
 */
function copyToClipboard(text: string): boolean {
  if (typeof navigator !== 'undefined' && navigator.clipboard) {
    navigator.clipboard.writeText(text).catch(() => undefined);
    return true;
  }
  if (typeof document === 'undefined') return false;
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();
  let copied = false;
  try {
    copied = document.execCommand('copy');
  } catch {
    // `copied` is already `false` — `execCommand` never completed its
    // assignment before throwing.
  }
  document.body.removeChild(textarea);
  return copied;
}

export function CredentialsRevealPanel({
  loginIdentifier,
  initialPassword,
}: {
  loginIdentifier: string;
  initialPassword: string;
}) {
  const [copyFailed, setCopyFailed] = useState(false);

  function handleCopy() {
    const ok = copyToClipboard(initialPassword);
    setCopyFailed(!ok);
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-text-secondary">
        This password is shown once — it cannot be retrieved again. Write it down or share it with
        the student now.
      </p>
      <dl className="space-y-2 rounded-md border border-border p-3 text-sm">
        <div className="flex items-center justify-between gap-2">
          <dt className="text-text-muted">Login ID</dt>
          <dd className="font-mono text-text-primary">{loginIdentifier}</dd>
        </div>
        <div className="flex items-center justify-between gap-2">
          <dt className="text-text-muted">Password</dt>
          <dd className="flex items-center gap-2 font-mono text-text-primary">
            {initialPassword}
            <button
              type="button"
              aria-label="Copy password"
              onClick={handleCopy}
              className="text-text-muted hover:text-text-primary"
            >
              <Copy className="size-4" aria-hidden />
            </button>
          </dd>
        </div>
      </dl>
      {copyFailed ? (
        <p className="text-xs text-text-muted">
          Couldn&apos;t copy automatically — select the password above and copy it manually.
        </p>
      ) : null}
    </div>
  );
}

/**
 * DoD item 8 — student credential reset shows the system-generated
 * plaintext password exactly once (`CredentialResetResponseDto
 * .initialPassword` — never retrievable again). A distinct component from
 * `TeacherInvitationSentDialog`: staff reset dispatches an invitation link
 * and shows no password at all, a genuinely different response shape and
 * UX, not a single generic dialog covering both.
 */
export function RevealCredentialsDialog({
  open,
  onOpenChange,
  studentProfileId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  studentProfileId: string;
}) {
  const resetCredentials = useResetStudentCredentials();
  const [revealed, setRevealed] = useState<{
    loginIdentifier: string;
    initialPassword: string;
  } | null>(null);
  const [error, setError] = useState<ReactNode | null>(null);

  async function handleReset() {
    setError(null);
    try {
      const result = await resetCredentials.mutateAsync(studentProfileId);
      setRevealed({
        loginIdentifier: result.loginIdentifier,
        initialPassword: result.initialPassword,
      });
    } catch (err) {
      setError(describeAcademicsError(err));
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (resetCredentials.isPending) return;
        if (!next) {
          setRevealed(null);
          setError(null);
        }
        onOpenChange(next);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Reset student credentials</DialogTitle>
        </DialogHeader>
        {revealed ? (
          <CredentialsRevealPanel
            loginIdentifier={revealed.loginIdentifier}
            initialPassword={revealed.initialPassword}
          />
        ) : (
          <p className="text-sm text-text-secondary">
            This issues a fresh, system-generated password for this student, replacing their current
            one. The new password is shown exactly once, here.
          </p>
        )}
        {error ? (
          <div
            role="alert"
            className="rounded-md border border-danger/30 bg-danger-subtle px-3 py-2 text-sm text-danger-subtle-foreground"
          >
            {error}
          </div>
        ) : null}
        <DialogFooter>
          {revealed ? (
            <Button onClick={() => onOpenChange(false)}>Done</Button>
          ) : (
            <>
              <Button
                variant="secondary"
                onClick={() => onOpenChange(false)}
                disabled={resetCredentials.isPending}
              >
                Cancel
              </Button>
              <Button onClick={() => void handleReset()} loading={resetCredentials.isPending}>
                Reset credentials
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
