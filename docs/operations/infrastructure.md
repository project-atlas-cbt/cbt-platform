# Production infrastructure

**Status:** B23 (2026-10-04). The AWS side of the platform is code: `infra/cdk` (AWS CDK,
TypeScript, owner decision). Staging and production are the same code with different sizes
(`infra/cdk/src/config.ts`). The web tier is on Vercel and is F21's. Deploying is
[deploy-and-rollback.md](deploy-and-rollback.md); migrations are [migrations.md](migrations.md).

## What exists

Every stack is in **af-south-1** (Cape Town), the owner's decision recorded as the ADR-0032
amendment.

| Stack                      | Holds                                                                                                                                                                                                                                                                                                                   |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Atlas-<env>-Network`      | VPC over 3 AZs: public (ALB, NAT), private app (tasks), isolated data (no internet route). Rejected-traffic flow logs. S3 gateway endpoint. App and load-balancer security groups.                                                                                                                                      |
| `Atlas-<env>-Registry`     | ECR repositories `atlas-<env>-server` and `atlas-<env>-ops`: immutable tags, scan on push, KMS, last 30 images kept.                                                                                                                                                                                                    |
| `Atlas-<env>-Data`         | KMS key. RDS PostgreSQL 18.3 **Multi-AZ** (35-day PITR, encrypted, `rds.force_ssl`), **RDS Proxy** with TLS required (app roles only). ElastiCache **Valkey** (2 nodes, failover, TLS + AUTH, `noeviction`). S3 media bucket (KMS, versioning, 35-day noncurrent expiry, TLS-only policy, CORS for `https://*.<root>`). |
| `Atlas-<env>-App`          | ECS cluster; API and worker services (Fargate, circuit-breaker rollback); ops task (migrations, golden path); ALB (HTTPS, TLS 1.3 policy, WAF); wildcard certificate; SES identity; generated app secrets; alarms → SNS on-call.                                                                                        |
| `Atlas-<env>-DeployAccess` | GitHub OIDC provider and the deploy role, assumable only from this repository's GitHub environment of the same name.                                                                                                                                                                                                    |

The properties that matter (Multi-AZ, PITR, encryption, TLS, no schema-owner password in the API,
immutable images, environment-scoped deploy role, every alarm routed) are asserted on the
synthesised templates in `infra/cdk/test/stacks.test.ts`, which runs with the unit tests.

### Who can do what

| Principal          | Can                                                                                                                                                                   |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| API task role      | Objects in the media bucket (get/put/delete, versions), the data key, `ses:SendEmail` from the domain identity. Nothing else.                                         |
| Worker task role   | The same media and key rights. No email (it enqueues; the API sends).                                                                                                 |
| Ops task role      | The same, plus its task gets the **schema owner** password (migrations). API and worker never do.                                                                     |
| Database roles     | `atlas_app` (RLS-bound, B20 least privilege) and `atlas_audit_reader` through the proxy; the owner `atlas` connects to the instance directly, from the ops task only. |
| GitHub deploy role | `cdk deploy` through the bootstrap roles, push to this environment's ECR repositories, register and run ops task revisions on this environment's cluster.             |

Secrets live in Secrets Manager (`atlas/<env>/…`) and reach tasks only as ECS secrets. Database
and Redis URLs are composed at boot from host and password variables (`packages/config`
`composeConnectionUrls`), so no URL with a password exists anywhere in configuration.

## Bootstrapping an environment (once per account)

Production is always applied by Haneef; these steps are the same for staging.

1. **Enable af-south-1** on the AWS account (it is an opt-in region): Account → AWS Regions.
2. **SES:** request production access (leave the sandbox) for af-south-1 once the domain is
   verified (step 6). Until then SES only delivers to verified addresses.
3. **CDK bootstrap**, with credentials for that account:
   `pnpm --filter @atlas/infra exec cdk bootstrap aws://<account>/af-south-1`
4. **First deploy, with no tasks** (nothing may start before the first migration). The image
   repositories come first, because the services need an image to reference:

   ```sh
   cd infra/cdk
   CTX="-c environment=<env> -c account=<account> -c rootDomain=<root> -c productName=<name> \
     -c alarmEmails=<a@x,b@y> -c imageTag=<sha>"
   pnpm exec cdk deploy Atlas-<env>-Registry $CTX
   # build and push server and ops for <sha>:
   #   docker build -f infra/docker/Dockerfile.prod --target server -t <registry>/atlas-<env>-server:<sha> .
   #   docker build -f infra/docker/Dockerfile.prod --target ops    -t <registry>/atlas-<env>-ops:<sha> .
   pnpm exec cdk deploy --all $CTX -c bootstrap=true
   ```

   The App stack waits while its certificate is pending: add the validation records (step 6)
   as soon as ACM shows them. This deploy also creates the OIDC deploy role. If the account
   already has a GitHub OIDC provider, pass `-c githubOidcProviderArn=<arn>`.

5. **GitHub environment** named `<env>` with variables `AWS_ACCOUNT_ID`, `AWS_DEPLOY_ROLE_ARN`
   (stack output of `Atlas-<env>-DeployAccess`), `ROOT_DOMAIN`, `PRODUCT_NAME`, `ALARM_EMAILS`, and
   optionally `SENTRY_DSN`, `API_CERTIFICATE_ARN`, `SMOKE_SCHOOL`, `SMOKE_WEB`. For `production`, add
   **Haneef as required reviewer** and restrict deployments to tags `v*`.
6. **DNS at Vercel** (the domain's nameservers are Vercel's, because Vercel's wildcard domains
   require it). Add:
   - the ACM validation CNAMEs for `*.api.<root>` and `api.<root>` (shown in the ACM console, and
     in the CloudFormation events while the certificate waits);
   - `api.<root>` and `*.api.<root>` → CNAME to the stack output `LoadBalancerDns`;
   - the three SES DKIM CNAMEs (stack outputs `MailDkim1..3`), the MAIL FROM records for
     `mail.<root>` (MX `feedback-smtp.af-south-1.amazonses.com` and TXT `v=spf1 include:amazonses.com ~all`),
     and a DMARC TXT at `_dmarc.<root>` (start with `p=none; rua=mailto:<ops address>`, tighten
     after a clean month).
7. **Run the first migration and start services**: run the `Deploy` workflow (push to `dev` for
   staging; a `v*` tag for production). It migrates with the ops image, then deploys without
   `bootstrap`, which starts the tasks.
8. **Confirm SNS subscriptions**: each on-call address receives a confirmation email from SNS and
   must click it, or alarms are not delivered.
9. **Verify encryption at rest** (B20 carry-over) and record the output in the launch checklist:

   ```sh
   aws rds describe-db-instances --query 'DBInstances[?starts_with(DBInstanceIdentifier, `atlas`)].[DBInstanceIdentifier,StorageEncrypted,KmsKeyId,MultiAZ]'
   aws elasticache describe-replication-groups --query 'ReplicationGroups[].[ReplicationGroupId,AtRestEncryptionEnabled,TransitEncryptionEnabled,AuthTokenEnabled]'
   aws s3api get-bucket-encryption --bucket <MediaBucket stack output>
   aws s3api get-bucket-versioning --bucket <MediaBucket stack output>
   aws rds describe-db-proxies --query 'DBProxies[].[DBProxyName,RequireTLS]'
   ```

## Sizes

From the B21 capacity plan (`docs/performance/capacity-plan.md`), per environment in
`infra/cdk/src/config.ts`:

| Setting               | Staging             | Production                                |
| --------------------- | ------------------- | ----------------------------------------- |
| API tasks (min / max) | 2 / 8               | 4 / 12                                    |
| Worker tasks          | 2                   | 2                                         |
| Task size             | 1 vCPU, 2 GB        | 1 vCPU, 2 GB                              |
| Database              | db.m6g.large        | db.m6g.large                              |
| Cache                 | cache.m6g.large × 2 | cache.m6g.large × 2                       |
| NAT gateways          | 1                   | 2                                         |
| Log retention         | 30 days             | 90 days                                   |
| Deletion protection   | no                  | yes (snapshot on delete, bucket retained) |

`DATABASE_POOL_MAX=20` per task: (12 API + 2 worker) × 20 = 280 connections at full scale, which
the proxy multiplexes (`maxConnectionsPercent` 50). Re-check after the staging level-1,000 run.

## Alarms

All go to the SNS topic `atlas-<env>-oncall` (email until a paging tool is chosen —
[on-call-and-incident-response.md](on-call-and-incident-response.md)): API 5xx, unhealthy targets,
p95 latency above 2 s, fewer running API or worker tasks than the floor, database CPU, free
storage, RDS Proxy pinning, cache memory, and SES bounce and complaint rates. The Exam Health Monitor (B20) emails
`OPS_ALERT_EMAILS` (the same addresses) through SES.
