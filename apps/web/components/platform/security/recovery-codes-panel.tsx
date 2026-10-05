'use client';

import { useState } from 'react';
import { Copy, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';

/**
 * Recovery codes shown exactly once — after enrolment and after creating a
 * new set. Copy and download, then the admin confirms they have saved them
 * before `onDone`; once dismissed they are never retrievable again.
 */
export function RecoveryCodesPanel({ codes, onDone }: { codes: string[]; onDone: () => void }) {
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);
  const text = codes.join('\n');

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-semibold text-text-primary">Save your recovery codes</h3>
        <p className="mt-1 text-sm text-text-secondary">
          Each code signs you in once if you lose your authenticator. This is the only time they are
          shown — store them somewhere safe and offline.
        </p>
      </div>
      <ol
        aria-label="Recovery codes"
        className="grid grid-cols-2 gap-x-6 gap-y-1 rounded-md border border-border bg-surface-muted p-4 font-mono text-sm tabular-nums text-text-primary"
      >
        {codes.map((code) => (
          <li key={code}>{code}</li>
        ))}
      </ol>
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => {
            void navigator.clipboard?.writeText(text).then(() => setCopied(true));
          }}
        >
          <Copy aria-hidden /> {copied ? 'Copied' : 'Copy codes'}
        </Button>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => {
            const url = URL.createObjectURL(new Blob([`${text}\n`], { type: 'text/plain' }));
            const a = document.createElement('a');
            a.href = url;
            a.download = 'recovery-codes.txt';
            a.click();
            URL.revokeObjectURL(url);
          }}
        >
          <Download aria-hidden /> Download
        </Button>
      </div>
      <div className="flex items-center gap-2">
        <Checkbox
          id="recovery-codes-saved"
          checked={saved}
          onCheckedChange={(checked) => setSaved(checked === true)}
        />
        <Label htmlFor="recovery-codes-saved">I have saved these codes</Label>
      </div>
      <Button type="button" disabled={!saved} onClick={onDone}>
        Finish
      </Button>
    </div>
  );
}
