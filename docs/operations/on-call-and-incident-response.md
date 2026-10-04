# On-call, escalation and incident response

**Status:** B23 (2026-10-04). Routing is email until a paging tool is chosen (a launch-checklist
item). Runbooks for each failure: [failure-runbooks.md](failure-runbooks.md); alert meanings:
[exam-health-monitor.md](exam-health-monitor.md); restores:
[backup-and-restore.md](backup-and-restore.md).

## Where alerts come from

| Source                        | Goes to                                                 | Examples                                                                                                      |
| ----------------------------- | ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| CloudWatch alarms (infra/cdk) | SNS `atlas-<env>-oncall` → every `ALARM_EMAILS` address | API 5xx, unhealthy targets, p95 > 2 s, running tasks below floor, DB CPU/storage, proxy pinning, cache memory |
| Exam Health Monitor (B20)     | SES email to `OPS_ALERT_EMAILS`, Sentry, structured log | answer-save success below 95 %, submissions stuck, marking backlog                                            |
| Break-glass alert (ADR-0012)  | SES email to `OPS_ALERT_EMAILS`                         | a Software Admin acted on school data                                                                         |
| Sentry                        | Sentry project alerts                                   | new unhandled errors after a release                                                                          |
| Schools                       | the support address                                     | "students can't start", "results are wrong"                                                                   |

## Rota

- One **primary** and one **secondary** per week. Until there are two engineers, Haneef is primary
  and the secondary is "next business day".
- **Exam windows are the hot periods.** Schools tell us their sittings in advance (onboarding asks
  for the timetable); primary is reachable by phone for every scheduled sitting.
- Hand-over each Monday: open incidents, upcoming sittings, anything deployed last week.

## Severity

| Sev | Meaning                                                                               | Response                        |
| --- | ------------------------------------------------------------------------------------- | ------------------------------- |
| 1   | Students in a live sitting cannot start, answer or submit; or data exposure suspected | Immediately, any hour           |
| 2   | Degraded during a sitting (slow saves, delayed marking), or one school fully down     | Within 15 minutes in exam hours |
| 3   | Staff features broken, no sitting affected                                            | Same business day               |
| 4   | Cosmetic or a single user                                                             | Next planned release            |

Escalation: primary → secondary after 15 minutes without progress on Sev 1/2 → Haneef (always
informed of any Sev 1). Suspected data exposure is Sev 1 and also follows the breach procedure in
`docs/compliance/data-protection.md` §5 (the regulator is notified within 72 hours where required).

## Running an incident

1. **Acknowledge** in the incident channel: what is seen, which schools, whether exams are running.
2. **Tell invigilators first** if a sitting is affected: the script in
   [failure-runbooks.md §0](failure-runbooks.md) (keep pages open, do not reload).
3. **Stabilise before diagnosing.** A bad release: run Rollback
   ([deploy-and-rollback.md](deploy-and-rollback.md)). Load: the scaling runbook. A dependency:
   its runbook.
4. **One person changes things**; everyone else observes. Write a timeline as you go (times in
   UTC and WAT).
5. **Close** when the platform is healthy and affected attempts are accounted for
   (`ops:attempts-affected` after any database restore).
6. **Review** within five working days for Sev 1/2: timeline, impact (schools, attempts), cause,
   what detection missed, actions with owners. Blameless; stored under `docs/operations/incidents/`.

## Talking to schools

The school admin is the contact. Say what is affected and what students should do, never a
cause before it is known, and when the next update will come. After a Sev 1, send a short written
summary of what happened to their students' attempts.

## Rehearsal (DoD 8)

Before launch, on staging, someone who did not write the runbooks runs a game day: a forced Multi-AZ
failover during a golden-path run, a cache failover, a bad deployment rolled back, and a PITR
restore with `ops:restore-verify`. Results go in the launch checklist.
