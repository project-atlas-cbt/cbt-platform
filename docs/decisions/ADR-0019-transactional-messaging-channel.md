# ADR-0019 — Transactional messaging channel

**Status:** Accepted
**Date:** 2026-08-24
**Deciders:** Project owner, engineering takeover review
**Audit findings:** M-07 (BLOCKER), A-02
**Blocks phases:** B1, B3, B10

## Context

The product depends on out-of-band delivery in at least six places, and no specification names a channel, provider, or template set:

- `03 §3` — the School Admin _"receives the activation key/invitation"_, by unstated means.
- `03 §11` — a Moderator receives _"Temporary credential/invitation"_.
- `04 §2` — the login screen offers _"Forgot password?"_.
- `05 §4.2` — expiry warnings to admin, school and platform.
- `09` — the stack table has no email or SMS provider row at all.

School onboarding cannot complete without delivering an activation key to a School Admin who has no account yet, and password reset cannot work without a channel.

The student case is different: the CSV import template (`03 §15`) has no email or phone column, and most Nigerian secondary-school students have no institutional email.

## Decision

**Transactional email now, behind an abstraction that makes SMS additive.**

- A `NotificationChannel` abstraction with an email implementation. SMS can be added later without touching call sites.
- **Staff-facing flows use email**: activation keys, staff invitations, password reset, subscription expiry warnings.
- **Student credentials are distributed offline** — system-generated initial passwords with a forced change on first login, and a Moderator-downloadable one-time credential sheet per class (resolves `A-02`). No student email is required or collected.
- In-app notifications (`06 §64`) remain the channel for operational messages that do not need to reach someone who is logged out.
- Sender domain configured with SPF, DKIM and DMARC before launch.

## Consequences

**Easier**

- Onboarding and password reset become implementable.
- No per-message cost or phone-number collection at launch.
- Adding SMS later is a channel implementation, not a refactor.

**Harder**

- Email deliverability to Nigerian school staff is a real risk and must be monitored — bounce and delivery rates become launch metrics.
- If deliverability proves inadequate in the pilot (B23), SMS moves from optional to required, and phone number becomes a staff-record field.
- Credential sheets are physical artefacts a school must handle securely; this must be covered in the onboarding documentation (F21).

**Required changes**

- B0: provider selection, `NotificationChannel` abstraction, template pipeline.
- B1: password reset dispatch, staff invitations, credential-sheet generation.
- B3: activation-key delivery, expiry warnings.
- B10: notification dispatch with retry.
- B23: deliverability monitoring; revisit SMS after the pilot.

## Amendment — 2026-10-04 (B23): Amazon SES

**Decision (project owner, B23):** the production email provider is **Amazon SES** in the
deployment region. `apps/api` `SesNotificationChannel` implements the same `NotificationChannel`
interface, selected by `NOTIFICATION_TRANSPORT=ses`; production refuses to boot with any other
transport or without `SES_FROM_ADDRESS`. Call sites and templates are unchanged.

- Sender: `no-reply@<root>` on a domain identity created by `infra/cdk` (Easy DKIM, MAIL FROM
  `mail.<root>`); only the API task may send, and only from that identity.
- Launch items: leave the SES sandbox; publish DKIM, SPF and DMARC records.
- Deliverability monitoring (this ADR's B23 item): CloudWatch alarms on the account's SES bounce
  and complaint rates route to on-call, and each message is tagged with its template so delivery
  problems can be traced to a message type. The SMS question is revisited after the pilot.
