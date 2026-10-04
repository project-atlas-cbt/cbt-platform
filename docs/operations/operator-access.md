# Operator access and break-glass

**Status:** B23 (2026-10-04). Who can reach production, how, and what is recorded. Product-level
Software Admin authority is ADR-0012; this document covers the people and machines around it.

## Principles

- **Nobody holds standing production credentials on a laptop.** Deployments assume an
  environment-scoped role through GitHub OIDC (`Atlas-<env>-DeployAccess`); `production` deploys
  wait for Haneef's approval in GitHub.
- **Production is applied by Haneef.** Claude sessions may provision and measure staging only.
- **No shell on running tasks.** ECS Exec is disabled on the API and worker. Operator commands run
  as a one-off ops task (`scripts/ci/ecs-ops-task.sh`), which leaves a task record, CloudTrail
  events and a log stream.
- **The schema owner password reaches only the ops task.** API and worker connect as `atlas_app`
  (RLS-bound) through RDS Proxy.
- **Every product-level privileged action is audited** (`audit_events`); the operator commands
  below write the same audit events as the console would.

## Access levels

| Level                    | Who                      | How                                                                                         |
| ------------------------ | ------------------------ | ------------------------------------------------------------------------------------------- |
| AWS account root         | Haneef only              | Hardware MFA, credentials offline. Used only for account-level recovery.                    |
| AWS administrator        | Haneef                   | IAM Identity Center user with MFA; short sessions. Bootstrap and incident work.             |
| AWS read-only (on-call)  | on-call engineers        | Identity Center `ReadOnlyAccess`: logs, metrics, ECS and RDS status. No data access.        |
| Deploy                   | GitHub Actions           | OIDC role per environment; production gated by required reviewer.                           |
| Software Admin (product) | named platform operators | `admin.<root>` with password + TOTP (required in production). Created by the command below. |
| Database owner           | ops task only            | Secret `atlas/<env>/db/owner`; never exported to a person's machine.                        |

## Provisioning a Software Admin

```sh
scripts/ci/ecs-ops-task.sh production <ops image> \
  pnpm --filter @atlas/api ops:create-software-admin -- \
  --email ops@<root> --first Ada --last Obi --reason "launch operator" --apply
```

The first account names no `--actor`; every later one must name an existing admin. The command
generates a 24-character password, emails it through SES to that address only (never printed in
production), and records `PLATFORM_SOFTWARE_ADMIN_CREATED`. The new admin must enrol TOTP at first
sign-in. Run without `--apply` first to check the inputs. **Known gap:** platform accounts have no
self-service password change yet; rotate by deactivating the account and creating a new one.

Removing an admin: set their `platform_role_assignments` row to inactive through the ops task on
the owner connection, with an audit reason, and revoke their sessions (`ops:mfa-reset` revokes
sessions as a side effect).

## Break-glass

Two kinds, never confused:

1. **Product break-glass (ADR-0012).** A Software Admin acting on a school's academic data
   (for example invalidating an attempt) goes through the break-glass path: a mandatory reason, an
   audit event the school can see, and an operational alert to `OPS_ALERT_EMAILS`. This is normal
   tooling for rare cases, not an emergency procedure.
2. **Infrastructure break-glass.** When normal access is not enough (the deploy pipeline is
   broken during an incident, or the only Software Admin lost their second factor):
   - Haneef uses the AWS administrator role, announces it in the incident channel, and writes down
     each action and its time.
   - Last-resort MFA reset: `ops:mfa-reset --target <id> --actor <id> --reason "..." --apply` as an
     ops task (audited as `PLATFORM_MFA_RESET`, sessions revoked).
   - A direct database change is a last resort: through an ops task on the owner connection, with
     the SQL reviewed by a second person first, and recorded in the incident's timeline.
   - Afterwards: review CloudTrail for the window, rotate any secret that was read, and record the
     use in the post-incident review.

## Reviews

- Monthly: list Software Admins (`GET /v1/platform/admins`) and AWS Identity Center users; remove
  anyone who no longer needs access.
- After every break-glass use: the review above.
- Each release: the deploy role's policy is unchanged unless the PR says why
  (`infra/cdk/src/deploy-access-stack.ts`).
