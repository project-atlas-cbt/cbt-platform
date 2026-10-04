# Load testing — how to run (B21)

The harness lives in `tools/load` (`@atlas/load`). It drives a **running** API over real HTTP the
way the F13 exam client does — tenant subdomain, CSRF, session cookie, per-question sequence
numbers, batch flushes with at most one in flight, a 30 s heartbeat, post-submit status polling —
and checks the results against the database afterwards. No new runtime dependency: `node:http`,
`perf_hooks` histograms, `tsx`.

Results land in `docs/performance/results/` as `<timestamp>-<scenario>-<tag>.{md,json}`. The harness writes
them unformatted; run `pnpm exec prettier --write docs/performance/results` before committing (CI's
`format:check` covers them).

## 1. Infrastructure

```bash
docker compose -f docker-compose.yml -f infra/load/docker-compose.load.yml up -d postgres redis minio pgbouncer
```

The overlay adds `pg_stat_statements` (statement-level evidence) and **PgBouncer 1.26 in
transaction mode** on `:6432` — the local stand-in for production **RDS Proxy** (project-owner
decision, 2026-10-02). Once per database, enable the statements view (it lives in schema `perf`, so
the application schema stays untouched):

```bash
docker exec atlas-postgres psql -U atlas -d atlas_dev -c "CREATE SCHEMA IF NOT EXISTS perf; CREATE EXTENSION IF NOT EXISTS pg_stat_statements SCHEMA perf;"
```

## 2. Start the API and worker the way production runs them

Build first (`pnpm turbo run build --filter=@atlas/api --filter=@atlas/worker`). Then start several
API processes behind the pooler (horizontal scaling, `09 §41`) and one worker:

| Variable                       | Load-test value                                                          | Why                                                               |
| ------------------------------ | ------------------------------------------------------------------------ | ----------------------------------------------------------------- |
| `DATABASE_APP_URL`             | `postgresql://atlas_app:atlas_app_dev_password@localhost:6432/atlas_dev` | through PgBouncer                                                 |
| `DATABASE_POOL_MAX`            | `20`                                                                     | per process; see `capacity-plan.md`                               |
| `TRUST_PROXY_HOPS`             | `1`                                                                      | the harness sends one `X-Forwarded-For` address per simulated lab |
| `LOG_LEVEL`                    | `warn`                                                                   | info-level request logging is not what is being measured          |
| `API_PORT`                     | `3001`, `3002`, `3003`                                                   | one per API process                                               |
| `MARKING_CONCURRENCY` (worker) | `4`                                                                      | parallel marking                                                  |

Each API process: `cd apps/api && API_PORT=3001 TRUST_PROXY_HOPS=1 LOG_LEVEL=warn node dist/main.js`.
The worker: `cd apps/worker && node dist/main.js`.

## 3. Provision

```bash
pnpm --filter @atlas/load provision --name b21 --schools 5 --students 300 --questions 40
```

Creates schools (each with a live subscription), staff, an academic year, classes of 40, an approved
40-question bank (through the real HTTP API — authoring, submit, HOD approval) and bulk-inserted
students (the exact rows `POST /students` + enrolment write). The manifest, including the
load-only shared password, goes to the git-ignored `tools/load/.state/`. `--media-kb 150` attaches a
generated image of that size to every question (the ADR-0021 media-heavy variant).

## 4. Scenarios

All take `--name <manifest>` and `--target <url[,url…]>` (round-robin across API processes).

| Command                                                             | What it proves                                                                         |
| ------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `load levels --levels 20,100,500,1000 --sustain 600`                | DoD 1, 4: sustained load at each level; answer-save p95/p99 and success; exact counts  |
| `load levels --levels 1000 --sustain 3600 --series`                 | Endurance: per-minute p95/p99 drift over a full-length exam                            |
| `load levels --levels 1500,2000 --sustain 300`                      | Stress beyond expected production load                                                 |
| `load burst --kind start --n 500`                                   | DoD 2: 500 simultaneous starts, each double-fired → exactly 500 attempts               |
| `load burst --kind submit --n 500`                                  | DoD 3: 500 simultaneous submissions → exactly 500 results                              |
| `load levels --levels 500 --flood 20`                               | DoD 9: 20 staff sessions hammer analytics/exports/search during an exam                |
| `load levels --levels 500 --sse 60`                                 | DoD 7: 60 Control Center streams held open during an exam                              |
| `load lab --clients 40 --window 20` (under a network profile)       | DoD 8: the 40-client lab burst on a constrained link                                   |
| `load lab --clients 40 --window 20 --precache` (under a profile)    | F20 DoD 9: the lab burst with media pre-cached before the bell                         |
| `dataset --name analytics --exams 47`, then `load analytics --n 10` | DoD 10: analytics budgets on a realistic school-term dataset                           |
| `rtt-probe --samples 30 --label "…"`                                | ADR-0032: RTT from this network to `eu-west-1`/`eu-west-2`/`af-south-1`/`eu-central-1` |

Every scenario exits non-zero when a budget or a correctness check fails (`--no-fail` to keep
going). The write-pressure knob is `--answer-interval` (mean ms between one student's answer
changes, default 10 000 — the audit's 1,000 × every-10-s model, `08 §20`); `--heartbeat` defaults to
F13's 30 000.

## 5. Network profiles (R-08, R-09)

`tools/load/netem/run.sh <profile> "3001 3002 3003"` starts a TCP relay in a Linux container whose
interface is shaped with `tc netem`, in front of every API process (`:1300x`) and object storage
(`:19000`). Point the harness at the relay — `--target http://127.0.0.1:13001/v1,… --media-host
127.0.0.1:19000` — and every virtual student shares one shaped link, as a lab shares one uplink.
netem shapes the relay's egress, i.e. both directions, so the per-direction delay is half the RTT:

| Profile        | RTT (≈) | Jitter  | Loss (round trip ≈) | Rate                      |
| -------------- | ------- | ------- | ------------------- | ------------------------- |
| `ng-typical`   | 150 ms  | ±40 ms  | 1 %                 | —                         |
| `ng-congested` | 300 ms  | ±100 ms | 3 %                 | 2 Mbit, shared by the lab |

`run.sh stop` removes it. (The harness itself stays on the host: pnpm's Windows junctions do not
resolve inside a Linux container, and a relay shapes the real TCP path either way.)

**Without `sch_netem`** (some sandboxes and CI kernels: `tc` reports "Specified qdisc kind is
unknown"), `tools/load/netem/shaper.mjs` is a user-space stand-in with the same ports and profiles:

```sh
PROFILE=ng-congested ROUTES=13001:127.0.0.1:3001,19000:127.0.0.1:9000 node tools/load/netem/shaper.mjs
```

It serialises every relayed byte through one shared link at the profile's rate, delays each
direction by the profile's normal distribution without reordering, and models a lost segment as a
retransmission an RTO later that also crosses the link twice. It does not model TCP congestion
control, so on a saturated link it is somewhat optimistic; set `LOAD_NETWORK_PROFILE` to say which
relay a report used.

**Pre-cached lab (F20).** `load lab --precache` models the F20 client (ADR-0021 amendment): when
the session opens, every student signs in and pre-caches the paper's encrypted media from the
preview (timed and reported, not the burst); the burst is then the bell — every student presses
Start inside the arrival window and is ready when the attempt package (with its media key) arrives,
because the media is decrypted locally. A check fails if any media is fetched live at Start.

## 6. CPU profiles

`node --import ./tools/load/scripts/cpu-profile.mjs dist/main.js` (from `apps/api`, with
`CPU_PROFILE_OUT`, `CPU_PROFILE_DELAY_MS`, `CPU_PROFILE_MS`) records a V8 profile under load;
`pnpm --filter @atlas/load exec tsx src/profile-summary.ts <file>` summarises self time by package
and function.

## 7. In CI

The `load-smoke` job runs 20- and 100-attempt levels plus a 100-way start and submit burst on every
pull request, against the CI service containers, with the same budgets — a regression in the exam
write path fails the build. The full levels stay manual (they need minutes and a quiet machine).
