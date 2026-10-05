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
   assign HODs to departments and teachers to subject-class offerings. Each receives a first
   password by email and must change it at first sign-in.
7. **Students**: import from the CSV template (Imports → Students). Print or download the
   credential sheet; students change their password at first sign-in.
8. **Questions**: teachers write or import questions; HODs review and approve them. Only approved
   revisions can go into an exam.
9. **Practice sitting**: before the first real exam, run a short practice exam in the lab with a
   real class, using [lab-preparation.md](lab-preparation.md). It proves the lab, the accounts
   and the invigilators' routine.

## What we hand the school

- The user guides for each role (F21).
- The **Help** screen in each staff workspace (ADR-0035): task guides for that role and the support
  contact. Show it during training, so staff know where to look once they forget a step.
- The invigilator card: [lab-preparation.md §On the day](lab-preparation.md#on-the-day).
- The support address and the escalation promise for exam hours
  ([on-call-and-incident-response.md](on-call-and-incident-response.md)).

## Subscription and renewal

Renewal keys are issued from the platform side. When a subscription expires the school keeps read
access to its records for a 14-day grace period and running attempts finish and are marked; new
activity is blocked until renewal (ADR-0015). No academic data is ever deleted by expiry.
