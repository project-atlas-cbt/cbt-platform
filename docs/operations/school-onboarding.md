# School onboarding

**Status:** B23 (2026-10-04), DoD 9. How a school goes from a signed agreement to its first
examination. Lab readiness is [lab-preparation.md](lab-preparation.md). The lifecycle behind
these steps is `docs/03-school-lifecycle.md`.

## Before anything is created

- The school has a signed agreement and DPA (ADR-0028), and has named a **school admin** (a
  person with an email address they read) and a **lab contact**.
- Agree the subdomain: lowercase letters, digits and hyphens, for example `kingscollege`. The
  school will use `https://kingscollege.<root>`; `admin`, `api` and `www` are reserved.
- Ask for the exam timetable for the first term, so on-call covers those sittings.

## Platform side (Software Admin, at `admin.<root>`)

1. **Create the school** with its name, subdomain and timezone (`Africa/Lagos`), the school
   admin's name and email, and the first subscription period (05 §3.2).
2. The platform **emails the activation key** to the school admin. If it does not arrive, check the
   address, then re-issue from the school's key history; the old key stops working.
3. Confirm the school appears as pending activation in the schools list.

## School side (school admin, at `https://<school>.<root>`)

The onboarding wizard walks through these in order; it cannot be completed without a current
session and at least one class (05 §5.2).

1. **Activate** with the emailed key and set a password.
2. **Branding**: logo and colour (optional).
3. **Academic session and term**: create and activate the current ones.
4. **Departments and subjects**, then **classes** (arms such as SS2A) and which subjects each class
   offers. Students are registered for offered subjects automatically; electives can be
   deregistered (ADR-0011).
5. **Grading scale** and **result policy** (ADR-0018, ADR-0010).
6. **Staff**: import teachers from the CSV template (Imports → Teachers) or add them one by one;
   assign HODs to departments and teachers to subject-class offerings. Each receives an
   invitation email with a link to the school's own address (`https://<school>.<root>`), where
   they set their password. The link works for one hour (`PASSWORD_RESET_TOKEN_TTL_SECONDS`); if
   it lapses, the school admin opens that person's page and uses **Reset credentials** to send a
   fresh one. "Forgot password" does not work until the invitation has been used.
7. **Students**: import from the CSV template (Imports → Students). Download each class's
   credential sheet from the class's page and handle it as below; students change their password
   at first sign-in.
8. **Questions**: teachers write or import questions; HODs review and approve them. Only approved
   revisions can go into an exam.
9. **Practice sitting**: before the first real exam, run a short practice exam in the lab with a
   real class, using [lab-preparation.md](lab-preparation.md). It proves the lab, the accounts
   and the invigilators' routine.

## Credential sheets (ADR-0019)

Students have no email, so their first passwords reach them on paper. A credential sheet is a list
of working passwords for a whole class, and the school must treat it that way:

- Print only when the class is about to sign in for the first time, and print one copy.
- Hand each student their own slip, cut from the sheet; never pin the sheet up or leave it in the
  lab.
- Collect and shred the remainder the same day. Delete the downloaded file from the computer and
  its downloads folder.
- Every student must change the password at first sign-in, so a sheet stops working once its
  class has signed in.
- **Download credential sheet** (the class's page) gives every student in the class a new
  password, including those who already changed theirs. Download it once per class. Download it
  again only when a sheet was lost or exposed before the class signed in, because that is what
  makes the old sheet useless.
- One forgotten password: **Reset credentials** on that student's page gives only that student a
  new password, shown once.

## What we hand the school

- The user guides for each role: [docs/user-guides](../user-guides/README.md) (teachers,
  invigilators, students).
- The invigilator card: [lab-preparation.md §On the day](lab-preparation.md#on-the-day).
- The support address and the escalation promise for exam hours
  ([on-call-and-incident-response.md](on-call-and-incident-response.md)).

## Subscription and renewal

Renewal keys are issued from the platform side. When a subscription expires the school keeps read
access to its records for a 14-day grace period and running attempts finish and are marked; new
activity is blocked until renewal (ADR-0015). No academic data is ever deleted by expiry.
