# Lab preparation

**Status:** B23 (2026-10-04), DoD 9; closes audit findings `R-09` (bandwidth in shared labs) and
`R-10` (old hardware) on the documentation side. The supported browsers and machine profile are in
[browser-and-hardware-baseline.md](browser-and-hardware-baseline.md); measured network behaviour is
in `docs/performance/capacity-plan.md`.

## A week before the first sitting

For every computer students will use:

1. **Browser**: Chrome or Edge 111+, or Firefox 115 ESR on Windows 7/8.1. Older browsers get a
   notice and cannot run exams.
2. **Open `https://<school>.<root>`** once and sign in as a test student. This installs the
   application shell and its service worker, so on exam day the app loads from the computer, not
   the school's connection (R-09).
3. **Run the computer check** on the test student's assessment preview: it must show no blocking
   items (local answer storage, network, storage space). Fix warnings where possible: maximise the
   window, zoom 100 %.
4. **Do not use private/incognito windows** and do not let any cleanup tool clear browser data
   between the practice and the exam; that removes the cached shell and any unsent answers.
5. Note each computer's label; invigilators will need it if a machine fails.

For the lab:

- **Connection**: one shared uplink is fine. The platform is built for about 2 Mbit/s with high
  latency for a lab: the shell is cached ahead of time, and each paper (including pictures) is
  downloaded once at Start. A connection that drops during the exam is tolerated; one that is down
  at Start is not.
- **Power**: computers on a UPS if available. If power fails, answers already saved on the
  computer survive; the student continues after restart on the same computer.
- **Clock**: does not matter. The server times each attempt.
- **Filtering**: allow `*.<root>`, `*.api.<root>` and the media bucket host over HTTPS (443). Do
  not intercept TLS for these hosts.

## Updates

The platform is updated on the server; the lab's computers fetch the new version on their own.

- A computer with an exam open keeps the version it started with until every exam on it is
  submitted, even if an update arrives mid-exam or the page is reloaded. Nothing in the exam
  changes and no answers are lost (F21, `apps/web/e2e/deployment.spec.ts`).
- On other pages a small notice says "A new version is ready" with a **Reload** button. Reloading
  is safe, but nobody has to: the next visit uses the new version.
- Updates are not scheduled during announced exam hours. If the platform is briefly unavailable
  (an update, a fault), students see a short "The service is briefly unavailable" page that retries
  by itself; a student already in an exam keeps answering and their answers are sent once it is
  back.

## Practice sitting

Run a 10-minute practice exam with a real class at least a few days before the first real one:
every computer starts, answers, loses the network for a minute (unplug the uplink), reconnects
and submits. It checks the lab, the accounts and the invigilators' routine together.

## On the day

Before students arrive:

- Open each computer to the school's address and sign out any previous user.
- The exam session must be **open** in the Exam Control Center for students to start.

Invigilator card:

> - Students sign in, read the preview, and press Start only when the computer check is clear.
> - If the connection drops, students keep answering. Answers are kept on the computer and sent
>   when the connection returns. **Do not reload, close the browser or restart the computer.**
> - If a computer fails, move the student to a spare computer, where they sign in and resume, and
>   tell the exam officer. Anything not yet sent from the old computer is sent when it is turned
>   back on and the exam page reopened.
> - Time is per student, starts when they press Start, and is kept by the server.
> - Absent students are marked in the Control Center; a makeup is a new attempt later (ADR-0014).

## Afterwards

- Leave every exam page open until the Control Center shows all attempts submitted.
- Report any computer that showed a warning so it can be fixed before the next sitting.
