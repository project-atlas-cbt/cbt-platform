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

## Amendment — 2026-10-04 (B23): SMTP for the VPS pilot

**Decision (project owner, B23):** on the single-server pilot (ADR-0032 amendment, same date),
email goes through **SMTP** to a provider such as Brevo or Resend, not SES. `apps/api`
`SmtpNotificationChannel` implements the same `NotificationChannel`, selected by
`NOTIFICATION_TRANSPORT=smtp`; production accepts `ses` or `smtp` and refuses to boot without
`SMTP_HOST`, `SMTP_USER`, `SMTP_PASSWORD` and a sender address. The channel requires TLS
(implicit on port 465, STARTTLS otherwise). Transports are chosen in one place,
`createNotificationChannel`, shared by the API and the ops CLIs. SES remains for the AWS design.

- Launch items: verify the sender domain with the provider (SPF, DKIM) and publish DMARC.
- Deliverability monitoring moves to the provider's dashboard; there is no bounce alarm on
  this deployment.

## Amendment — 2026-10-08: passwordless student sign-in

**Decision (project owner, 2026-10-08, for the OLA Maryway pilot):** a School Admin or Moderator
may switch on **sign-in without password** for every student of the school or for chosen classes.
While it is on, a student of those classes signs in with their **name and Login ID** instead of a
password; it stays on until someone switches it off (the owner chose this over an automatic end
time). The printed credential sheet and the forced first-login change above remain the default.

- Students only: the membership must hold the STUDENT role and no other, with an active student
  profile, and the school switch or one of the student's active classes must be on.
- The typed name must contain the recorded first name and surname, in any order and any case;
  middle names are optional and any other word fails. Failures are the same generic
  `UNAUTHENTICATED` response as password sign-in and count towards the same per-identifier lockout.
- The session is marked passwordless (`sessions.passwordless`): it skips the forced first password
  change and may never change the password, so signing in as a classmate cannot take over their
  account. Switching the setting off revokes every passwordless session it no longer covers.
- Accepted risk: while it is on, anyone who knows a student's name and Login ID can sign in as
  them from any device. Invigilation is the control; the screen says so.
- Audited: `STUDENT_PASSWORDLESS_SIGN_IN_CHANGED` (who, before/after, sessions ended) and
  `USER_SIGNED_IN_PASSWORDLESS` per sign-in.

## Amendment — 2026-10-12: email attachments

**Decision (project owner, for the school onboarding guide, later receipts and summaries):** an
email template may carry **static attachments**, sent over SMTP.

- Attachments belong to the template definition (`TemplateDefinition.attachments`), not to the
  message, so the dispatch queue payload is unchanged and no call site can attach arbitrary content.
- Validated when the template is registered, so a bad file fails at startup, not at send time:
  **PDF only** (declared type and `%PDF-` signature), safe file name, at most 3 files, 2 MB in
  total. Widening the types or the cap is a change to the constants in `template.ts` plus a test.
- Attachment bytes and names are never logged; the console transport prints file names only in
  development.
- The SES transport refuses a template with attachments (its simple content cannot carry them)
  rather than send the mail without them. Raw MIME is the route if the AWS design needs this.
- Per-recipient generated attachments (a receipt for one school) are not covered; they need a
  further amendment with a per-message, size-checked path.
