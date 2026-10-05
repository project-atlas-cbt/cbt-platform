# ADR-0036 — Editable platform settings (System Configuration)

**Status:** Accepted
**Date:** 2026-10-05
**Deciders:** Haneef (project owner)
**Audit findings:** none
**Affects phases:** none open (Software Admin console, `04 §5` "System Configuration")

## Context

`04 §5` and `04 §68` list "System Configuration" in the Software Admin navigation, but no
specification, roadmap phase or ADR says what it holds. The console showed a "not built yet"
placeholder. Every platform-wide setting lives in the server's environment file
(`packages/config/src/env.schema.ts`), read once at boot, so changing any of them means editing the
file on the VPS and restarting.

The owner was offered three directions on 2026-10-05: a read-only view of the settings in effect,
editable settings, or hiding the page. He chose **editable settings**, and then chose which: the
**operations and sign-in** set. Making the exam rules editable (the 60-second post-expiry grace,
ADR-0003; the 14-day subscription grace, ADR-0015) was offered and declined: those are decided
rules that change live exams and access, and stay where their ADRs put them.

## Decision

1. **A small, fixed set of platform settings becomes editable** from System Configuration
   (`/admin/settings`):

   | Setting                          | Replaces (env)                            | Limits                   |
   | -------------------------------- | ----------------------------------------- | ------------------------ |
   | Operations alert recipients      | `OPS_ALERT_EMAILS`                        | 0–10 addresses           |
   | Email sender name                | none (new; the default is `PRODUCT_NAME`) | 1–60 characters          |
   | Email sender address             | `SMTP_FROM_ADDRESS` / `SES_FROM_ADDRESS`  | same domain as the env's |
   | Default timezone for new schools | `DEFAULT_SCHOOL_TIMEZONE`                 | a valid IANA zone        |
   | Software Admin session length    | `PLATFORM_SESSION_TTL_SECONDS`            | 1–24 hours               |
   | Software Admin idle sign-out     | `PLATFORM_SESSION_IDLE_TIMEOUT_SECONDS`   | 5–120 minutes            |
   | School user session length       | `SESSION_TTL_SECONDS`                     | 1–30 days                |
   | Failed sign-ins before lockout   | `AUTH_LOCKOUT_MAX_ATTEMPTS`               | 3–20                     |
   | Lockout window                   | `AUTH_LOCKOUT_WINDOW_SECONDS`             | 5–120 minutes            |
   | Password reset link lifetime     | `PASSWORD_RESET_TOKEN_TTL_SECONDS`        | 15 minutes–24 hours      |

   The list, labels and limits live in one place (`packages/config/src/platform-settings.ts`). A
   new editable setting needs an amendment to this ADR.

2. **The environment file stays the default.** A setting with no stored value uses its env value
   (or built-in default), exactly as before this ADR, so a fresh server or a wiped settings table
   behaves as it always did. "Reset to default" deletes the stored value.

3. **Never editable:** secrets and keys, database, Redis and storage addresses, the SMTP host and
   credentials, the email transport, domains and cookie settings, rate and load-shedding limits,
   `PLATFORM_MFA_REQUIRED`, and every exam, marking and subscription rule. These change the
   server's security boundary or decided product rules, and stay in the env file or their ADRs.

4. **Stored in one platform table**, `platform_settings` (key, JSON value, who and when), with no
   `school_id` and no RLS, like `platform_sessions`. Only Software Admins can read or change it,
   through new permissions `platform.settings.view` and `platform.settings.manage`.

5. **Every change is deliberate and traceable.** A change needs a reason, records one platform
   audit event per setting (`PLATFORM_SETTING_CHANGED`, with old and new values), and emails every
   other Software Admin. Values outside the limits are refused by the server, not just the page.

6. **Changes apply within 30 seconds, without a restart.** Each process (API and worker) caches the
   resolved settings for 30 seconds. Session lengths apply to sessions started after the change;
   the idle sign-out and lockout rules apply on the next check. A changed sender address should be
   checked with **Send test email**, which sends to the signed-in admin using the settings in
   effect.

7. **The sender address must stay on the env sender's domain**, because the email provider only
   sends from a domain it has verified. A typo in the local part still reaches the provider, so
   the page offers the test email next to it.

## Consequences

- Pilot tuning (session lengths, lockout, alert recipients) no longer needs a server edit and
  restart, and every change is in the audit log.
- A second place now holds configuration. The page always shows where each value comes from
  (default or changed), and the env file remains the floor every value falls back to.
- If the settings table cannot be read, every process falls back to the env values and logs a
  warning, so sign-in and email never depend on it.
