# Deploy and rollback

**Status:** B23 (2026-10-04), DoD 3. Workflows: `.github/workflows/deploy.yml`,
`deploy-release.yml`, `rollback.yml`.

**Paused for the VPS pilot (2026-10-04):** the AWS deploy no longer runs on merges or tags, only
by hand from the Actions tab, until the AWS accounts exist (ADR-0032 amendment). The pilot deploys
with `infra/vps/bin/deploy.sh` ([vps-pilot.md](vps-pilot.md)). The table below is the AWS design.

## Environments

| Environment | Where                            | Data                                                | Deploys                                                                  |
| ----------- | -------------------------------- | --------------------------------------------------- | ------------------------------------------------------------------------ |
| local       | a developer machine, `pnpm dev`  | seed and test data                                  | by hand                                                                  |
| CI          | GitHub Actions, per job          | created per run                                     | every pull request and push                                              |
| staging     | AWS (own stacks), Vercel preview | non-production only (test, or `ops:anonymise-copy`) | **automatically on every merge to `dev`**                                |
| production  | AWS, Vercel production           | schools' data                                       | **on a `v*` tag, after Haneef approves** in the `production` environment |

Staging and production are the same CDK code; only sizes differ (`infra/cdk/src/config.ts`).
Production data is never copied to staging except as an anonymised copy (ADR-0028, B22).

## What a deployment does

`deploy-release.yml`, the same for both environments:

1. **Build** the `server` and `ops` images and push them with the tag (the commit SHA for staging,
   the version tag for production). Tags are immutable: an existing image is reused, never rebuilt.
2. **Migrate** by running the new `ops` image as a one-off task inside the VPC
   (`scripts/ci/ecs-ops-task.sh`). If it fails, the deployment stops and the running release is
   untouched. Migrations are expand-only ([migrations.md](migrations.md)), so the running release
   keeps working on the new schema.
3. **Roll** with `cdk deploy`: new task definitions, ECS replaces tasks keeping 100 % healthy
   capacity, and the **circuit breaker rolls back automatically** if new tasks do not become
   healthy (`/v1/health/ready` behind the ALB).
4. **Smoke** (`pnpm --filter @atlas/load smoke`): read-only checks of every host shape, readiness,
   tenant resolution, authentication refusal, CORS and security headers. Safe on production.
5. **Golden path** on staging only: the `09 §39` journey, run from inside the VPC.

Deployments to one environment never overlap (a concurrency group per environment).

### Releasing to production

1. Merge to `dev`; staging deploys and its golden path passes.
2. Tag that commit: `git tag v2026.10.0 <sha> && git push origin v2026.10.0`.
3. Haneef approves the `production` deployment in GitHub.
4. Watch the smoke step, then the dashboards for 15 minutes.

Do not deploy production while exams are running unless the release fixes an exam-day incident:
a rolling deployment is safe for in-flight attempts (answers are idempotent and drained on
shutdown, B22), but there is no reason to take the risk during a sitting.

## Rollback

Run **Rollback** (Actions → Rollback → Run workflow) with the environment and an earlier tag. It
redeploys that image (the same bytes) with today's infrastructure code and **does not migrate**:
the schema stays where it is, which expand-only migrations make safe. Production still waits for
approval.

When to roll back rather than fix forward: errors or latency alarms right after a deployment,
a failed smoke step after the services rolled, or a broken critical path reported by a school.

What rollback does not undo: data written by the newer release (it stays, and the older release
must tolerate it, which is what the mixed-version CI job checks), and a contract migration (which
is why those ship only after the release that stops using the old shape).

### Rehearsal

DoD 3 asks for rollback rehearsed. On staging: deploy release A, deploy B, roll back to A, run the
golden path, deploy B again. Record it in the launch checklist.

## Feature flags

`08 §23` asks for feature flags. The platform uses **typed environment toggles** validated at boot
(`packages/config/src/env.schema.ts`), for example `LOAD_SHED_ENABLED`, `PLATFORM_MFA_REQUIRED`,
`NOTIFICATION_TRANSPORT`, set per environment in `infra/cdk/src/app-stack.ts`. Changing one is a
deployment of the same image with new configuration, so it is audited in git, rolls like any
deployment, and is reversible by rollback. No runtime flag service or per-school flag mechanism
was added: nothing in the specifications needs a flag that changes without a deployment, and a
second configuration path would be one more thing to secure. If one is needed later, it is a new
decision.
