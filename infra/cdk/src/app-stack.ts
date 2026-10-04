import { CfnOutput, Duration, RemovalPolicy, Stack, type StackProps } from 'aws-cdk-lib';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as cwActions from 'aws-cdk-lib/aws-cloudwatch-actions';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import type * as ecr from 'aws-cdk-lib/aws-ecr';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import * as ses from 'aws-cdk-lib/aws-ses';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as subscriptions from 'aws-cdk-lib/aws-sns-subscriptions';
import * as wafv2 from 'aws-cdk-lib/aws-wafv2';
import type { Construct } from 'constructs';
import { API_PORT, type AtlasEnvironment, type DeployInputs } from './config.js';
import type { DataStack } from './data-stack.js';
import type { NetworkStack } from './network-stack.js';
import type { RegistryStack } from './registry-stack.js';

export interface AppStackProps extends StackProps {
  readonly network: NetworkStack;
  readonly data: DataStack;
  readonly registry: RegistryStack;
  readonly inputs: DeployInputs;
}

/**
 * The running platform: the API behind an HTTPS load balancer (with WAF),
 * the worker, the one-off migration/ops task definition, and the alarms
 * routed to on-call. One image runs both services (Dockerfile.prod
 * `server`); migrations run from the `ops` image before a new version
 * starts (docs/operations/deploy-and-rollback.md).
 */
export class AppStack extends Stack {
  readonly cluster: ecs.Cluster;
  readonly apiService: ecs.FargateService;
  readonly workerService: ecs.FargateService;
  readonly migrationTask: ecs.FargateTaskDefinition;
  readonly alarmTopic: sns.Topic;

  constructor(scope: Construct, id: string, env: AtlasEnvironment, props: AppStackProps) {
    super(scope, id, props);
    const { network, data, registry, inputs } = props;
    // ADR-0022 amendment (2026-10-04): each school's browser calls the API
    // at `<school>.api.<root>`, so the tenant still comes from the Host
    // header (ADR-0005). One wildcard certificate and DNS record cover all.
    const apiHost = `api.${inputs.rootDomain}`;
    const schoolApiHosts = `*.${apiHost}`;

    this.cluster = new ecs.Cluster(this, 'Cluster', {
      vpc: network.vpc,
      containerInsightsV2: ecs.ContainerInsights.ENHANCED,
    });

    // --- Application secrets (generated once, rotated by operators) --------
    const appSecret = (logicalId: string, name: string) =>
      new secretsmanager.Secret(this, logicalId, {
        secretName: `atlas/${env.name}/app/${name}`,
        generateSecretString: { excludePunctuation: true, passwordLength: 64 },
      });
    const sessionSecret = appSecret('SessionCookieSecret', 'session-cookie-secret');
    const csrfSecret = appSecret('CsrfSecret', 'csrf-secret');
    const mfaKey = appSecret('MfaEncryptionKey', 'mfa-encryption-key');
    const precacheSecret = appSecret('MediaPrecacheSecret', 'media-precache-secret');

    const environment: Record<string, string> = {
      NODE_ENV: 'production',
      // Which deployment this is; tools that write test data refuse anything
      // but staging (tools/load/src/golden-path.ts).
      ATLAS_ENVIRONMENT: env.name,
      PRODUCT_NAME: inputs.productName,
      PLATFORM_ROOT_DOMAIN: inputs.rootDomain,
      COOKIE_DOMAIN: inputs.rootDomain,
      WEB_ORIGIN: `https://${inputs.rootDomain}`,
      API_PORT: String(API_PORT),
      DATABASE_HOST: data.proxy.endpoint,
      DATABASE_OWNER_HOST: data.database.dbInstanceEndpointAddress,
      DATABASE_NAME: 'atlas',
      DATABASE_SSLMODE: 'require',
      // Capacity plan §7: (API tasks + worker tasks) × 20 ≤ the proxy limit.
      DATABASE_POOL_MAX: '20',
      REDIS_HOST: data.cacheEndpoint,
      S3_BUCKET: data.mediaBucket.bucketName,
      S3_REGION: env.region,
      S3_FORCE_PATH_STYLE: 'false',
      // Versioning is the bucket's own configuration here (DataStack).
      S3_ENSURE_VERSIONING: 'false',
      RELEASE_VERSION: inputs.imageTag,
      LOG_LEVEL: 'info',
      OPS_ALERT_EMAILS: inputs.alarmEmails.join(','),
      // ADR-0019 provider (B23 owner decision): Amazon SES, sending from
      // the root domain's identity below.
      NOTIFICATION_TRANSPORT: 'ses',
      SES_FROM_ADDRESS: `"${inputs.productName}" <no-reply@${inputs.rootDomain}>`,
      SES_REGION: env.region,
      ...(inputs.sentryDsn ? { SENTRY_DSN: inputs.sentryDsn } : {}),
    };
    const json = (secret: secretsmanager.ISecret, field: string) =>
      ecs.Secret.fromSecretsManager(secret, field);
    const secrets: Record<string, ecs.Secret> = {
      DATABASE_APP_PASSWORD: json(data.appRoleSecret, 'password'),
      DATABASE_AUDIT_READER_PASSWORD: json(data.auditReaderSecret, 'password'),
      REDIS_AUTH_TOKEN: ecs.Secret.fromSecretsManager(data.cacheAuthToken),
      SESSION_COOKIE_SECRET: ecs.Secret.fromSecretsManager(sessionSecret),
      CSRF_SECRET: ecs.Secret.fromSecretsManager(csrfSecret),
      MFA_ENCRYPTION_KEY: ecs.Secret.fromSecretsManager(mfaKey),
      MEDIA_PRECACHE_SECRET: ecs.Secret.fromSecretsManager(precacheSecret),
    };

    const logGroup = (name: string) =>
      new logs.LogGroup(this, `${name}Logs`, {
        logGroupName: `/atlas/${env.name}/${name.toLowerCase()}`,
        retention: env.logRetentionDays,
        removalPolicy: RemovalPolicy.DESTROY,
      });

    const taskDefinition = (
      name: string,
      repository: ecr.IRepository,
      command: string[] | undefined,
      extra: { environment?: Record<string, string>; secrets?: Record<string, ecs.Secret> } = {},
    ) => {
      const task = new ecs.FargateTaskDefinition(this, `${name}Task`, {
        cpu: 1024,
        memoryLimitMiB: 2048,
        runtimePlatform: {
          cpuArchitecture: ecs.CpuArchitecture.X86_64,
          operatingSystemFamily: ecs.OperatingSystemFamily.LINUX,
        },
      });
      task.addContainer(name, {
        image: ecs.ContainerImage.fromEcrRepository(repository, inputs.imageTag),
        ...(command ? { command } : {}),
        environment: { ...environment, ...extra.environment },
        secrets: { ...secrets, ...extra.secrets },
        logging: ecs.LogDrivers.awsLogs({
          streamPrefix: name.toLowerCase(),
          logGroup: logGroup(name),
        }),
        readonlyRootFilesystem: false,
        // Matches SHUTDOWN_TIMEOUT_MS (25 s) plus margin: in-flight answer
        // saves finish before the task is stopped (B22 graceful drain).
        stopTimeout: Duration.seconds(30),
        ...(name === 'Api' ? { portMappings: [{ containerPort: API_PORT }] } : {}),
      });
      // Media: objects in this one bucket (presigned URLs are signed with
      // these permissions), including B22's version purge on redaction —
      // never bucket creation, deletion or policy. Written as IAM
      // statements, not `bucket.grant*`, which would edit the data key's
      // policy in the data stack and tie it back to this one.
      task.addToTaskRolePolicy(
        new iam.PolicyStatement({
          actions: ['s3:ListBucket', 's3:ListBucketVersions', 's3:GetBucketVersioning'],
          resources: [data.mediaBucket.bucketArn],
        }),
      );
      task.addToTaskRolePolicy(
        new iam.PolicyStatement({
          actions: [
            's3:GetObject',
            's3:PutObject',
            's3:DeleteObject',
            's3:DeleteObjectVersion',
            's3:GetObjectVersion',
          ],
          resources: [data.mediaBucket.arnForObjects('*')],
        }),
      );
      task.addToTaskRolePolicy(
        new iam.PolicyStatement({
          actions: ['kms:Decrypt', 'kms:GenerateDataKey'],
          resources: [data.key.keyArn],
        }),
      );
      return task;
    };

    // --- API ------------------------------------------------------------------
    const apiTask = taskDefinition('Api', registry.server, ['node', 'apps/api/dist/main.js'], {
      // Exactly one proxy (the ALB) in front: the client address is the
      // right-most X-Forwarded-For entry it appends (B20 carry-over).
      environment: { TRUST_PROXY_HOPS: '1' },
    });
    // Only the API sends email (the worker enqueues onto the dispatch queue
    // the API consumes), and only from this domain's identity. Its DKIM
    // and MAIL FROM records are published at the DNS host (Vercel); see
    // docs/operations/infrastructure.md.
    const mailIdentity = new ses.EmailIdentity(this, 'MailIdentity', {
      identity: ses.Identity.domain(inputs.rootDomain),
      mailFromDomain: `mail.${inputs.rootDomain}`,
    });
    apiTask.addToTaskRolePolicy(
      new iam.PolicyStatement({
        actions: ['ses:SendEmail'],
        resources: [
          this.formatArn({
            service: 'ses',
            resource: 'identity',
            resourceName: inputs.rootDomain,
          }),
        ],
      }),
    );
    mailIdentity.dkimRecords.forEach((record, i) => {
      new CfnOutput(this, `MailDkim${i + 1}`, {
        value: `${record.name} CNAME ${record.value}`,
        description: 'Publish at the DNS host so SES can sign mail (DKIM)',
      });
    });

    // Bootstrap: no task may start before the first migration has run.
    const floor = (count: number) => (inputs.bootstrap ? 0 : count);
    this.apiService = new ecs.FargateService(this, 'ApiService', {
      cluster: this.cluster,
      taskDefinition: apiTask,
      desiredCount: floor(env.api.desiredCount),
      securityGroups: [network.appSecurityGroup],
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      minHealthyPercent: 100,
      maxHealthyPercent: 200,
      circuitBreaker: { enable: true, rollback: true },
      enableExecuteCommand: false,
      healthCheckGracePeriod: Duration.seconds(60),
    });

    // --- Load balancer -----------------------------------------------------------
    const alb = new elbv2.ApplicationLoadBalancer(this, 'Alb', {
      vpc: network.vpc,
      internetFacing: true,
      securityGroup: network.loadBalancerSecurityGroup,
      vpcSubnets: { subnetType: ec2.SubnetType.PUBLIC },
      // SSE streams (Exam Control Center) carry heartbeats well inside this.
      idleTimeout: Duration.seconds(120),
      dropInvalidHeaderFields: true,
      deletionProtection: env.protectData,
    });
    // DNS lives at Vercel (wildcard school subdomains need Vercel's
    // nameservers), so the validation record is added there by hand; the
    // first deploy waits until it is (docs/operations/infrastructure.md).
    const certificate = inputs.apiCertificateArn
      ? acm.Certificate.fromCertificateArn(this, 'ApiCertificate', inputs.apiCertificateArn)
      : new acm.Certificate(this, 'ApiCertificate', {
          domainName: schoolApiHosts,
          subjectAlternativeNames: [apiHost],
          validation: acm.CertificateValidation.fromDns(),
        });
    alb.addRedirect({ sourcePort: 80, targetPort: 443 });
    const listener = alb.addListener('Https', {
      port: 443,
      certificates: [certificate],
      sslPolicy: elbv2.SslPolicy.RECOMMENDED_TLS,
      open: false,
    });
    const target = listener.addTargets('Api', {
      port: API_PORT,
      protocol: elbv2.ApplicationProtocol.HTTP,
      targets: [this.apiService],
      healthCheck: {
        // 503 while draining or when the database is unreachable; Redis
        // and storage only report degraded (B22).
        path: '/v1/health/ready',
        healthyHttpCodes: '200',
        interval: Duration.seconds(10),
        healthyThresholdCount: 2,
        unhealthyThresholdCount: 3,
      },
      deregistrationDelay: Duration.seconds(30),
    });

    const scaling = this.apiService.autoScaleTaskCount({
      minCapacity: floor(env.api.desiredCount),
      maxCapacity: inputs.bootstrap ? 1 : env.api.maxCount,
    });
    // Capacity plan: scale out at ≤ 70 % of one vCPU per task.
    scaling.scaleOnCpuUtilization('Cpu', {
      targetUtilizationPercent: 60,
      scaleOutCooldown: Duration.seconds(60),
      scaleInCooldown: Duration.minutes(10),
    });
    scaling.scaleOnRequestCount('Requests', {
      requestsPerTarget: 3000, // per minute ≈ 50 req/s per 1-vCPU task
      targetGroup: target,
      scaleOutCooldown: Duration.seconds(60),
      scaleInCooldown: Duration.minutes(10),
    });

    // WAF: known-bad inputs and IP reputation only. No per-IP rate rule —
    // a whole school lab shares one address, and the API's own per-IP and
    // per-identifier limits already apply (B20/B21). The managed common
    // rule set is not used: its body-size rule blocks legitimate imports.
    const waf = new wafv2.CfnWebACL(this, 'Waf', {
      scope: 'REGIONAL',
      defaultAction: { allow: {} },
      visibilityConfig: {
        cloudWatchMetricsEnabled: true,
        metricName: `atlas-${env.name}-waf`,
        sampledRequestsEnabled: true,
      },
      rules: ['AWSManagedRulesKnownBadInputsRuleSet', 'AWSManagedRulesAmazonIpReputationList'].map(
        (name, priority) => ({
          name,
          priority,
          overrideAction: { none: {} },
          statement: { managedRuleGroupStatement: { vendorName: 'AWS', name } },
          visibilityConfig: {
            cloudWatchMetricsEnabled: true,
            metricName: name,
            sampledRequestsEnabled: true,
          },
        }),
      ),
    });
    new wafv2.CfnWebACLAssociation(this, 'WafAssociation', {
      resourceArn: alb.loadBalancerArn,
      webAclArn: waf.attrArn,
    });

    // --- Worker ---------------------------------------------------------------
    const workerTask = taskDefinition('Worker', registry.server, [
      'node',
      'apps/worker/dist/main.js',
    ]);
    this.workerService = new ecs.FargateService(this, 'WorkerService', {
      cluster: this.cluster,
      taskDefinition: workerTask,
      desiredCount: floor(env.worker.desiredCount),
      securityGroups: [network.appSecurityGroup],
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      minHealthyPercent: 100,
      maxHealthyPercent: 200,
      circuitBreaker: { enable: true, rollback: true },
    });

    // --- Migration / ops one-off task --------------------------------------------
    // Default command: `pnpm db:migrate:deploy` (creates the runtime roles,
    // applies migrations, reasserts grants). Operators override the command
    // for ops:* CLIs. Only this task holds the schema owner's password.
    this.migrationTask = taskDefinition('Ops', registry.ops, undefined, {
      secrets: { DATABASE_OWNER_PASSWORD: json(data.ownerSecret, 'password') },
    });

    // --- Alarms -> on-call ------------------------------------------------------
    this.alarmTopic = new sns.Topic(this, 'OnCall', {
      topicName: `atlas-${env.name}-oncall`,
      enforceSSL: true,
    });
    for (const address of inputs.alarmEmails) {
      this.alarmTopic.addSubscription(new subscriptions.EmailSubscription(address));
    }
    const notify = new cwActions.SnsAction(this.alarmTopic);
    const alarm = (
      logicalId: string,
      metric: cloudwatch.IMetric,
      threshold: number,
      description: string,
      comparison = cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
      evaluationPeriods = 3,
    ) => {
      const a = new cloudwatch.Alarm(this, logicalId, {
        metric,
        threshold,
        evaluationPeriods,
        comparisonOperator: comparison,
        treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
        alarmDescription: `${description} Runbook: docs/operations/failure-runbooks.md`,
      });
      a.addAlarmAction(notify);
      a.addOkAction(notify);
      return a;
    };
    const minute = Duration.minutes(1);
    // ADR-0019 B23 item: deliverability. SES pauses an account whose
    // bounce rate passes 10 % or complaint rate 0.5 %; alarm well before.
    const sesReputation = (name: string) =>
      new cloudwatch.Metric({
        namespace: 'AWS/SES',
        metricName: name,
        period: Duration.hours(1),
        statistic: 'Maximum',
      });
    alarm(
      'SesBounceRate',
      sesReputation('Reputation.BounceRate'),
      0.05,
      'SES bounce rate above 5 % (sending is paused at 10 %).',
      undefined,
      1,
    );
    alarm(
      'SesComplaintRate',
      sesReputation('Reputation.ComplaintRate'),
      0.001,
      'SES complaint rate above 0.1 % (sending is paused at 0.5 %).',
      undefined,
      1,
    );
    alarm(
      'Api5xx',
      alb.metrics.httpCodeTarget(elbv2.HttpCodeTarget.TARGET_5XX_COUNT, { period: minute }),
      50,
      'API returning server errors (5xx) — answer saves may be failing.',
    );
    alarm(
      'ApiUnhealthyTargets',
      target.metrics.unhealthyHostCount({ period: minute }),
      0,
      'API tasks failing their readiness check.',
    );
    alarm(
      'ApiLatencyP95',
      alb.metrics.targetResponseTime({ period: minute, statistic: 'p95' }),
      2,
      'API p95 latency above 2 s.',
    );
    alarm(
      'ApiRunningTasks',
      this.apiService.metric('RunningTaskCount', { period: minute, statistic: 'Minimum' }),
      env.api.desiredCount,
      'Fewer API tasks running than the floor.',
      cloudwatch.ComparisonOperator.LESS_THAN_THRESHOLD,
    );
    alarm(
      'WorkerRunningTasks',
      this.workerService.metric('RunningTaskCount', { period: minute, statistic: 'Minimum' }),
      1,
      'No worker running — marking and auto-submission are paused.',
      cloudwatch.ComparisonOperator.LESS_THAN_THRESHOLD,
    );
    alarm(
      'DbCpu',
      data.database.metricCPUUtilization({ period: minute }),
      80,
      'Database CPU above 80 %.',
    );
    alarm(
      'DbFreeStorage',
      data.database.metricFreeStorageSpace({ period: Duration.minutes(5) }),
      20 * 1024 ** 3,
      'Database free storage below 20 GiB.',
      cloudwatch.ComparisonOperator.LESS_THAN_THRESHOLD,
      1,
    );
    alarm(
      'ProxyPinnedConnections',
      new cloudwatch.Metric({
        namespace: 'AWS/RDS',
        metricName: 'DatabaseConnectionsCurrentlySessionPinned',
        dimensionsMap: { ProxyName: data.proxy.dbProxyName },
        period: minute,
        statistic: 'Maximum',
      }),
      10,
      'RDS Proxy pinning sessions (capacity plan §7) — tenant context must stay transaction-local.',
    );
    alarm(
      'CacheMemory',
      new cloudwatch.Metric({
        namespace: 'AWS/ElastiCache',
        metricName: 'DatabaseMemoryUsagePercentage',
        dimensionsMap: { ReplicationGroupId: data.cacheReplicationGroupId },
        period: minute,
        statistic: 'Maximum',
      }),
      80,
      'Cache memory above 80 % (noeviction: writes fail when full).',
    );

    new CfnOutput(this, 'LoadBalancerDns', {
      value: alb.loadBalancerDnsName,
      description: `CNAME ${schoolApiHosts} and ${apiHost} to this at Vercel DNS`,
    });
    new CfnOutput(this, 'ClusterName', { value: this.cluster.clusterName });
    new CfnOutput(this, 'MediaBucket', { value: data.mediaBucket.bucketName });
    new CfnOutput(this, 'ApiServiceName', { value: this.apiService.serviceName });
    new CfnOutput(this, 'WorkerServiceName', { value: this.workerService.serviceName });
    new CfnOutput(this, 'OpsTaskDefinition', { value: this.migrationTask.family });
    new CfnOutput(this, 'TaskSubnets', {
      value: network.vpc.privateSubnets.map((s) => s.subnetId).join(','),
    });
    new CfnOutput(this, 'TaskSecurityGroup', { value: network.appSecurityGroup.securityGroupId });
  }
}
