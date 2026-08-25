# @atlas/notifications

ADR-0019's `NotificationChannel` abstraction and template pipeline
(`docs/decisions/ADR-0019-transactional-messaging-channel.md`).

## Provider decision (B0)

**Console/dev transport.** `ConsoleNotificationChannel` renders a
registered template and writes it to an injectable sink (`console.log` by
default). This is the ADR's explicitly-allowed B0 scope — "a working
dev/console transport is sufficient for now" — not a stand-in left
unfinished.

**Deferred to B23** (per the ADR): selecting a real transactional email
provider (SES/Postmark), and configuring the sending domain's SPF, DKIM,
and DMARC records.

## What's here vs. what isn't

- `NotificationChannel` / `NotificationMessage` — the abstraction every
  send call site depends on.
- `TemplateRegistry` — register a `{name, subject, text, html?}` template,
  render it with `{{token}}` substitution.
- `ConsoleNotificationChannel` — the B0 provider.

**No real product templates ship here.** Activation-key delivery, staff
invitations, password reset, and subscription-expiry warnings are B1/B3/B10
scope (see the ADR's "Required changes" table) — those phases register
their own templates against this same `TemplateRegistry` rather than this
package inventing product copy prematurely.
