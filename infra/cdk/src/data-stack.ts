import { Duration, RemovalPolicy, Stack, type StackProps } from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as elasticache from 'aws-cdk-lib/aws-elasticache';
import * as kms from 'aws-cdk-lib/aws-kms';
import * as rds from 'aws-cdk-lib/aws-rds';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import type { Construct } from 'constructs';
import type { AtlasEnvironment } from './config.js';
import type { NetworkStack } from './network-stack.js';

export interface DataStackProps extends StackProps {
  readonly network: NetworkStack;
  readonly rootDomain: string;
}

/** Secrets Manager generated passwords: URL-safe characters only. */
const PASSWORD_SPEC = { excludePunctuation: true, passwordLength: 48 } as const;

/**
 * Everything that holds data. B22's recovery objectives are configured
 * here: Multi-AZ database (AZ failure: RPO ~0, RTO minutes), 35-day PITR
 * (corruption: RPO ≤ 5 min), a replicated cache with automatic failover
 * (Redis is never authoritative), and a versioned bucket whose noncurrent
 * versions expire at 35 days (ADR-0028, B22 decision 6A). Every store is
 * encrypted at rest — the database, cache and bucket with this
 * environment's customer-managed key; secrets with Secrets Manager's own
 * AWS-managed key (a CMK there would make every reader's grant a key-policy
 * edit in this stack, tying it to the app stack). The B20 carry-over
 * "encryption-at-rest verification" checks these properties on the
 * provisioned resources (docs/operations/infrastructure.md).
 */
export class DataStack extends Stack {
  readonly key: kms.Key;
  readonly database: rds.DatabaseInstance;
  readonly proxy: rds.DatabaseProxy;
  readonly ownerSecret: secretsmanager.ISecret;
  readonly appRoleSecret: secretsmanager.Secret;
  readonly auditReaderSecret: secretsmanager.Secret;
  readonly cacheAuthToken: secretsmanager.Secret;
  readonly cacheEndpoint: string;
  readonly cacheReplicationGroupId: string;
  readonly mediaBucket: s3.Bucket;

  constructor(scope: Construct, id: string, env: AtlasEnvironment, props: DataStackProps) {
    super(scope, id, props);
    const { network } = props;
    const removalPolicy = env.protectData ? RemovalPolicy.RETAIN : RemovalPolicy.DESTROY;

    // Ingress only from the app tasks: the application goes through the
    // proxy; migrations and ops commands reach the instance directly
    // (advisory locks, session features). The cache admits the tasks only.
    const sg = (logicalId: string, description: string) =>
      new ec2.SecurityGroup(this, logicalId, {
        vpc: network.vpc,
        description,
        allowAllOutbound: false,
      });
    const databaseSecurityGroup = sg('DatabaseSg', 'RDS PostgreSQL');
    const proxySecurityGroup = sg('ProxySg', 'RDS Proxy');
    const cacheSecurityGroup = sg('CacheSg', 'ElastiCache (Valkey)');
    const pg = ec2.Port.tcp(5432);
    proxySecurityGroup.addIngressRule(network.appSecurityGroup, pg, 'app -> proxy');
    proxySecurityGroup.addEgressRule(databaseSecurityGroup, pg, 'proxy -> database');
    databaseSecurityGroup.addIngressRule(network.appSecurityGroup, pg, 'migrations -> database');
    cacheSecurityGroup.addIngressRule(network.appSecurityGroup, ec2.Port.tcp(6379), 'app -> cache');

    this.key = new kms.Key(this, 'DataKey', {
      alias: `alias/atlas-${env.name}-data`,
      enableKeyRotation: true,
      removalPolicy: RemovalPolicy.RETAIN,
      description: `Atlas ${env.name}: database, cache, bucket and secrets at rest`,
    });

    // --- PostgreSQL ---------------------------------------------------------
    const parameters = new rds.ParameterGroup(this, 'DbParameters', {
      engine: rds.DatabaseInstanceEngine.postgres({ version: rds.PostgresEngineVersion.VER_18_3 }),
      parameters: {
        'rds.force_ssl': '1',
        log_min_duration_statement: '1000',
        log_lock_waits: '1',
        // Never log statement text with parameters — answers and PII would
        // land in CloudWatch (B20 log hygiene).
        log_statement: 'none',
        idle_in_transaction_session_timeout: '60000',
      },
    });

    this.database = new rds.DatabaseInstance(this, 'Database', {
      engine: rds.DatabaseInstanceEngine.postgres({ version: rds.PostgresEngineVersion.VER_18_3 }),
      instanceType: new ec2.InstanceType(env.database.instanceClass),
      vpc: network.vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_ISOLATED },
      securityGroups: [databaseSecurityGroup],
      multiAz: true,
      databaseName: 'atlas',
      // The schema owner: runs migrations; the app never connects as it.
      credentials: rds.Credentials.fromGeneratedSecret('atlas', {
        secretName: `atlas/${env.name}/db/owner`,
      }),
      parameterGroup: parameters,
      storageType: rds.StorageType.GP3,
      allocatedStorage: env.database.allocatedStorageGiB,
      maxAllocatedStorage: env.database.maxAllocatedStorageGiB,
      storageEncrypted: true,
      storageEncryptionKey: this.key,
      backupRetention: Duration.days(35),
      preferredBackupWindow: '00:00-01:00', // 01:00–02:00 WAT, outside school hours
      preferredMaintenanceWindow: 'sun:01:30-sun:02:30',
      autoMinorVersionUpgrade: false, // upgrades are scheduled, never mid-term
      copyTagsToSnapshot: true,
      deletionProtection: env.protectData,
      removalPolicy: env.protectData ? RemovalPolicy.SNAPSHOT : RemovalPolicy.DESTROY,
      enablePerformanceInsights: true,
      performanceInsightEncryptionKey: this.key,
      monitoringInterval: Duration.seconds(60),
      cloudwatchLogsExports: ['postgresql'],
      iamAuthentication: false,
    });
    this.ownerSecret = this.database.secret!;

    const roleSecret = (logicalId: string, role: string) =>
      new secretsmanager.Secret(this, logicalId, {
        secretName: `atlas/${env.name}/db/${role}`,
        generateSecretString: {
          ...PASSWORD_SPEC,
          secretStringTemplate: JSON.stringify({ username: role }),
          generateStringKey: 'password',
        },
      });
    // Created in the database by the migration task (ensureRuntimeRoles).
    this.appRoleSecret = roleSecret('AppRoleSecret', 'atlas_app');
    this.auditReaderSecret = roleSecret('AuditReaderSecret', 'atlas_audit_reader');

    this.proxy = this.database.addProxy('Proxy', {
      secrets: [this.appRoleSecret, this.auditReaderSecret],
      vpc: network.vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_ISOLATED },
      securityGroups: [proxySecurityGroup],
      requireTLS: true,
      // Capacity plan §7: the proxy's backend share stays well under
      // max_connections, leaving headroom for migrations and operators.
      maxConnectionsPercent: 50,
      maxIdleConnectionsPercent: 25,
      borrowTimeout: Duration.seconds(10),
      debugLogging: false,
    });

    // --- Cache (Valkey) -------------------------------------------------------
    this.cacheAuthToken = new secretsmanager.Secret(this, 'CacheAuthToken', {
      secretName: `atlas/${env.name}/cache/auth-token`,
      generateSecretString: { ...PASSWORD_SPEC, passwordLength: 64 },
    });
    const cacheSubnets = new elasticache.CfnSubnetGroup(this, 'CacheSubnets', {
      description: `Atlas ${env.name} cache`,
      subnetIds: network.vpc.isolatedSubnets.map((s) => s.subnetId),
    });
    // BullMQ requires keys never be evicted: noeviction, not an LRU policy.
    const cacheParameters = new elasticache.CfnParameterGroup(this, 'CacheParameters', {
      cacheParameterGroupFamily: 'valkey8',
      description: 'BullMQ: noeviction',
      properties: { 'maxmemory-policy': 'noeviction' },
    });
    const cache = new elasticache.CfnReplicationGroup(this, 'Cache', {
      replicationGroupDescription: `Atlas ${env.name} cache and queues (never authoritative)`,
      engine: 'valkey',
      engineVersion: '8.0',
      cacheNodeType: env.cache.nodeType,
      numCacheClusters: 2,
      automaticFailoverEnabled: true,
      multiAzEnabled: true,
      cacheSubnetGroupName: cacheSubnets.ref,
      cacheParameterGroupName: cacheParameters.ref,
      securityGroupIds: [cacheSecurityGroup.securityGroupId],
      transitEncryptionEnabled: true,
      atRestEncryptionEnabled: true,
      kmsKeyId: this.key.keyId,
      authToken: this.cacheAuthToken.secretValue.unsafeUnwrap(),
      // Redis is not backed up (CLAUDE.md): the worker re-registers job
      // schedulers and reconciliation re-queues owed work after a wipe.
      snapshotRetentionLimit: 0,
      preferredMaintenanceWindow: 'sun:02:30-sun:03:30',
    });
    this.cacheEndpoint = cache.attrPrimaryEndPointAddress;
    this.cacheReplicationGroupId = cache.ref;

    // --- Object storage --------------------------------------------------------
    this.mediaBucket = new s3.Bucket(this, 'MediaBucket', {
      encryption: s3.BucketEncryption.KMS,
      encryptionKey: this.key,
      bucketKeyEnabled: true,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      enforceSSL: true,
      minimumTLSVersion: 1.2,
      versioned: true,
      objectOwnership: s3.ObjectOwnership.BUCKET_OWNER_ENFORCED,
      lifecycleRules: [
        {
          id: 'noncurrent-35-days',
          noncurrentVersionExpiration: Duration.days(35),
          abortIncompleteMultipartUploadAfter: Duration.days(1),
          expiredObjectDeleteMarker: true,
        },
      ],
      // Browsers fetch media and precache it directly from presigned URLs
      // (ADR-0021); only school subdomains may read cross-origin.
      cors: [
        {
          allowedMethods: [s3.HttpMethods.GET, s3.HttpMethods.HEAD, s3.HttpMethods.PUT],
          allowedOrigins: [`https://*.${props.rootDomain}`],
          allowedHeaders: ['*'],
          exposedHeaders: ['ETag'],
          maxAge: 3000,
        },
      ],
      removalPolicy,
      autoDeleteObjects: !env.protectData,
    });
  }
}
