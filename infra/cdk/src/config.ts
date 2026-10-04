/**
 * B23: the two deployed environments (08 §22). Staging mirrors production's
 * configuration — the same topology, Multi-AZ database behind RDS Proxy,
 * replicated cache, TLS everywhere — so the B21 load re-run and the B22
 * failover/restore measurements taken there stand for production (DoD 2).
 * Only data and a few sizes differ, and each difference is named below.
 *
 * Owner decisions recorded here (2026-10-04): region af-south-1 (ADR-0032
 * amendment), Multi-AZ instance + RDS Proxy, AWS CDK.
 */
export type EnvironmentName = 'staging' | 'production';

export interface AtlasEnvironment {
  readonly name: EnvironmentName;
  readonly region: string;
  /** GitHub Actions environment the deploy role trusts (OIDC `sub`). */
  readonly githubEnvironment: EnvironmentName;
  readonly api: { readonly desiredCount: number; readonly maxCount: number };
  readonly worker: { readonly desiredCount: number };
  readonly database: {
    readonly instanceClass: string;
    readonly allocatedStorageGiB: number;
    readonly maxAllocatedStorageGiB: number;
  };
  readonly cache: { readonly nodeType: string };
  readonly natGateways: number;
  /** Production refuses accidental deletion of anything holding data. */
  readonly protectData: boolean;
  readonly logRetentionDays: number;
}

export const GITHUB_REPOSITORY = 'project-atlas-cbt/cbt-platform';
export const REGION = 'af-south-1';
/** `API_PORT` inside the task; the load balancer targets it. */
export const API_PORT = 3001;

/**
 * Sizing from docs/performance/capacity-plan.md: one Node process per
 * 1-vCPU task, scale out; a 1,000-attempt exam needs ~4 API tasks. The
 * worker runs two tasks so a task loss never pauses marking (BullMQ locks
 * make a second worker safe, B14/B22).
 */
export const ENVIRONMENTS: Record<EnvironmentName, AtlasEnvironment> = {
  staging: {
    name: 'staging',
    region: REGION,
    githubEnvironment: 'staging',
    // Same ceiling as production, so the 1,000-attempt re-run can scale out.
    api: { desiredCount: 2, maxCount: 8 },
    worker: { desiredCount: 2 },
    database: {
      instanceClass: 'm6g.large',
      allocatedStorageGiB: 100,
      maxAllocatedStorageGiB: 500,
    },
    cache: { nodeType: 'cache.m6g.large' },
    // Difference from production: one NAT gateway (cost); an AZ loss there
    // only removes outbound internet, never the data tier.
    natGateways: 1,
    protectData: false,
    logRetentionDays: 30,
  },
  production: {
    name: 'production',
    region: REGION,
    githubEnvironment: 'production',
    api: { desiredCount: 4, maxCount: 12 },
    worker: { desiredCount: 2 },
    database: {
      instanceClass: 'm6g.large',
      allocatedStorageGiB: 200,
      maxAllocatedStorageGiB: 2000,
    },
    cache: { nodeType: 'cache.m6g.large' },
    natGateways: 2,
    protectData: true,
    // Operational logs (redacted, no request bodies or PII by B20's log
    // hygiene): 90 days, added to the retention schedule in B23 as a
    // proposal for the legal review — the schedule had no logs row.
    logRetentionDays: 90,
  },
};

/** Values that are not decided in code: passed as CDK context. */
export interface DeployInputs {
  /** `PLATFORM_ROOT_DOMAIN` — the commercial domain is still TBD (PROJECT.md). */
  readonly rootDomain: string;
  /** Image tag both services run; the deploy workflow passes the commit SHA. */
  readonly imageTag: string;
  /** Existing ACM certificate for `api.<root>`; created (DNS-validated) if absent. */
  readonly apiCertificateArn?: string;
  /** On-call addresses for CloudWatch alarms and the Exam Health Monitor. */
  readonly alarmEmails: readonly string[];
  readonly sentryDsn?: string;
  /** `PRODUCT_NAME` — never hard-coded (PROJECT.md). */
  readonly productName: string;
}
