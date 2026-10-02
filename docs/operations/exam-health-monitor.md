# Exam Health Monitor — runbook

**Status:** B20 (2026-10-02), 09 §37. "We don't want to find out about an exam outage from a school
administrator's WhatsApp message."

## How it works

- `apps/api` (`ExamTelemetryService`) counts every answer save as **ok**, **failed** (server error)
  or **rejected** (a correct refusal — attempt expired/not writable/stale sequence), plus attempt
  starts, submissions (with latency) and failed sign-ins, into per-minute Redis buckets
  (`atlas:health:<counter>:<minute>`), and into OpenTelemetry metrics when an exporter is set.
- `apps/worker` (`atlas-exam-health-monitor`, every `EXAM_HEALTH_INTERVAL_MS`, default 60 s) reads a
  sliding window (`EXAM_HEALTH_WINDOW_MINUTES`, default 5), adds live state (active attempts across
  schools, marking-queue backlog) and evaluates the conditions below.
- Alerts fire **once** on FIRING and once on RESOLVED (state in `atlas:health:alert:<KEY>`), to:
  the structured log (warn/error), Sentry (when `SENTRY_DSN` is set), and an email to every address
  in `OPS_ALERT_EMAILS` (rendered by the API from the `operational-alert` template).
- The latest evaluation is kept at `atlas:health:snapshot` (Redis) for inspection.

## Conditions

| Alert                     | Fires when                                                                                                 | Severity                    |
| ------------------------- | ---------------------------------------------------------------------------------------------------------- | --------------------------- |
| `ANSWER_SAVE_SUCCESS_LOW` | ok/(ok+failed) < `EXAM_HEALTH_ANSWER_SUCCESS_MIN` (0.95) over ≥ `EXAM_HEALTH_ANSWER_MIN_SAMPLE` (50) saves | warning; critical below 80% |
| `SUBMISSION_LATENCY_HIGH` | submission p95 > 5 s over ≥ 20 submissions                                                                 | warning                     |
| `MARKING_QUEUE_BACKLOG`   | > 500 jobs waiting, or the oldest has waited > 5 min                                                       | warning                     |
| `AUTH_FAILURE_SPIKE`      | > 300 failed sign-ins in the window (credential stuffing)                                                  | warning                     |

Policy rejections never count as failures — a lab finishing at the bell produces many correct
"attempt expired" refusals and must not page anyone.

## Responding

1. **ANSWER_SAVE_SUCCESS_LOW** — exams are live and answers are not being stored. Check `/v1/health/ready`,
   database connection saturation and error rate (Sentry), Redis. Students' answers are safe in
   their browsers (offline queue, F13) and will replay with sequence numbers once the API recovers —
   **do not ask schools to restart exams**. Tell affected schools to keep students on the exam page.
2. **SUBMISSION_LATENCY_HIGH** — database contention is the usual cause (submit freezes answers in
   one transaction). Check long-running queries and locks.
3. **MARKING_QUEUE_BACKLOG** — is the worker running? Failed-job count rising means marking errors
   (Sentry, `queue=atlas-attempt-marking`). Marking is idempotent; jobs can be retried safely.
4. **AUTH_FAILURE_SPIKE** — look for one source address or one school; lockout and the per-IP sign-in
   limit are already containing it. Consider blocking at the edge (B23 WAF).
5. **Break-glass alerts** (`BREAK_GLASS_*`, sent by the API on every use) — confirm the action was
   expected; the audit row holds the reason.

## Tuning

Thresholds are environment variables (see `.env.example`); B21's load results are the input for
re-tuning them. Changing them needs no deployment of new code.
