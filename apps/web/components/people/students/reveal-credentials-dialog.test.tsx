import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CredentialsRevealPanel } from './reveal-credentials-dialog';

/**
 * Regression test for a real runtime crash found via live testing:
 * `navigator.clipboard` is `undefined` outside a "secure context" (HTTPS or
 * exactly `localhost`) — this project's own local-dev convention serves
 * every school over plain HTTP on a `*.localtest.me` subdomain, which is
 * neither, so a bare `navigator.clipboard.writeText(...)` call threw
 * `Cannot read properties of undefined (reading 'writeText')` the moment an
 * admin clicked "Copy password". Pre-existing before this markup was
 * extracted into a shared component; surfaced far more often once
 * `StudentForm`'s auto-reveal-on-create started showing this panel after
 * every student creation, not just an explicit "Reset credentials" click.
 */
describe('CredentialsRevealPanel', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('copies via navigator.clipboard when it is available', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } });

    render(<CredentialsRevealPanel loginIdentifier="ST001" initialPassword="Xy7-abcd" />);
    await userEvent.click(screen.getByRole('button', { name: /copy password/i }));

    expect(writeText).toHaveBeenCalledWith('Xy7-abcd');
    expect(screen.queryByText(/couldn't copy automatically/i)).not.toBeInTheDocument();
  });

  it('never crashes when navigator.clipboard is undefined, and falls back gracefully', async () => {
    vi.stubGlobal('navigator', { ...navigator, clipboard: undefined });

    render(<CredentialsRevealPanel loginIdentifier="ST001" initialPassword="Xy7-abcd" />);

    // The real bug: this used to throw synchronously inside the click
    // handler. Clicking must not throw at all.
    await expect(
      userEvent.click(screen.getByRole('button', { name: /copy password/i })),
    ).resolves.not.toThrow();

    // jsdom's `execCommand` fallback doesn't actually copy anything — the
    // panel should say so rather than pretend it worked.
    expect(await screen.findByText(/couldn't copy automatically/i)).toBeInTheDocument();
  });
});
