/**
 * B23 DoD 1–2: the infrastructure is code, and the properties the owner
 * decisions, B20 and B22 depend on are asserted on the synthesised
 * templates — no AWS account needed. A change that weakens one of them
 * (single-AZ database, shorter PITR, plaintext cache, a public bucket, the
 * schema owner's password reaching the API) fails here before it can
 * reach `cdk deploy`.
 */
import { App } from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';
import { describe, expect, it } from 'vitest';
import { buildEnvironment } from '../src/build.js';
import type { EnvironmentName } from '../src/config.js';

function synth(environment: EnvironmentName) {
  const app = new App({ context: { '@aws-cdk/core:defaultCrossStackReferences': 'strong' } });
  const stacks = buildEnvironment(app, {
    environment,
    account: '111111111111',
    inputs: {
      rootDomain: 'example.ng',
      imageTag: 'abc123',
      productName: 'Example',
      alarmEmails: ['oncall@example.ng'],
    },
  });
  return {
    stacks,
    network: Template.fromStack(stacks.network),
    data: Template.fromStack(stacks.data),
    app: Template.fromStack(stacks.application),
    registry: Template.fromStack(stacks.registry),
    deploy: Template.fromStack(stacks.deployAccess),
  };
}

type Container = {
  Name: string;
  Environment?: { Name: string; Value: unknown }[];
  Secrets?: { Name: string }[];
};
function containers(template: Template): Container[] {
  return Object.values(template.findResources('AWS::ECS::TaskDefinition')).flatMap(
    (r) =>
      (r as { Properties: { ContainerDefinitions: Container[] } }).Properties.ContainerDefinitions,
  );
}
const envOf = (c: Container) =>
  Object.fromEntries((c.Environment ?? []).map((e) => [e.Name, e.Value]));
const secretNames = (c: Container) => (c.Secrets ?? []).map((s) => s.Name);

describe.each(['staging', 'production'] as const)('%s', (environment) => {
  const t = synth(environment);

  it('deploys every stack to af-south-1 (ADR-0032 amendment)', () => {
    for (const stack of Object.values(t.stacks)) expect(stack.region).toBe('af-south-1');
  });

  it('runs PostgreSQL 18 Multi-AZ, encrypted, with 35-day PITR (B22 objectives)', () => {
    t.data.hasResourceProperties('AWS::RDS::DBInstance', {
      Engine: 'postgres',
      EngineVersion: Match.stringLikeRegexp('^18\\.'),
      MultiAZ: true,
      StorageEncrypted: true,
      BackupRetentionPeriod: 35,
      DeletionProtection: environment === 'production',
      PubliclyAccessible: false,
    });
    t.data.hasResourceProperties('AWS::RDS::DBParameterGroup', {
      Parameters: Match.objectLike({ 'rds.force_ssl': '1', log_statement: 'none' }),
    });
  });

  it('puts the app roles behind RDS Proxy with TLS required (owner decision)', () => {
    t.data.hasResourceProperties('AWS::RDS::DBProxy', {
      RequireTLS: true,
      EngineFamily: 'POSTGRESQL',
      Auth: Match.arrayWith([Match.objectLike({ AuthScheme: 'SECRETS' })]),
    });
    const proxy = Object.values(t.data.findResources('AWS::RDS::DBProxy'))[0] as {
      Properties: { Auth: unknown[] };
    };
    // atlas_app and atlas_audit_reader only — never the schema owner.
    expect(proxy.Properties.Auth).toHaveLength(2);
  });

  it('runs a replicated Valkey cache, encrypted in transit and at rest, noeviction for BullMQ', () => {
    t.data.hasResourceProperties('AWS::ElastiCache::ReplicationGroup', {
      Engine: 'valkey',
      TransitEncryptionEnabled: true,
      AtRestEncryptionEnabled: true,
      AutomaticFailoverEnabled: true,
      MultiAZEnabled: true,
      NumCacheClusters: 2,
    });
    t.data.hasResourceProperties('AWS::ElastiCache::ParameterGroup', {
      Properties: { 'maxmemory-policy': 'noeviction' },
    });
  });

  it('keeps media private, versioned, KMS-encrypted, TLS-only, noncurrent versions 35 days', () => {
    t.data.hasResourceProperties('AWS::S3::Bucket', {
      VersioningConfiguration: { Status: 'Enabled' },
      PublicAccessBlockConfiguration: {
        BlockPublicAcls: true,
        BlockPublicPolicy: true,
        IgnorePublicAcls: true,
        RestrictPublicBuckets: true,
      },
      BucketEncryption: {
        ServerSideEncryptionConfiguration: [
          Match.objectLike({
            ServerSideEncryptionByDefault: Match.objectLike({ SSEAlgorithm: 'aws:kms' }),
          }),
        ],
      },
      LifecycleConfiguration: {
        Rules: Match.arrayWith([
          Match.objectLike({ NoncurrentVersionExpiration: { NoncurrentDays: 35 } }),
        ]),
      },
      CorsConfiguration: {
        CorsRules: [Match.objectLike({ AllowedOrigins: ['https://*.example.ng'] })],
      },
    });
    t.data.hasResourceProperties('AWS::S3::BucketPolicy', {
      PolicyDocument: {
        Statement: Match.arrayWith([
          Match.objectLike({
            Effect: 'Deny',
            Condition: { Bool: { 'aws:SecureTransport': 'false' } },
          }),
        ]),
      },
    });
  });

  it('gives the API and worker production config and no schema-owner password', () => {
    const all = containers(t.app);
    const api = all.find((c) => c.Name === 'Api')!;
    const worker = all.find((c) => c.Name === 'Worker')!;
    const ops = all.find((c) => c.Name === 'Ops')!;

    expect(envOf(api)).toMatchObject({
      NODE_ENV: 'production',
      TRUST_PROXY_HOPS: '1',
      PLATFORM_ROOT_DOMAIN: 'example.ng',
      COOKIE_DOMAIN: 'example.ng',
      DATABASE_SSLMODE: 'require',
      S3_FORCE_PATH_STYLE: 'false',
      RELEASE_VERSION: 'abc123',
      PRODUCT_NAME: 'Example',
    });
    expect(envOf(worker).TRUST_PROXY_HOPS).toBeUndefined();

    for (const c of [api, worker]) {
      expect(secretNames(c)).not.toContain('DATABASE_OWNER_PASSWORD');
      expect(secretNames(c)).toEqual(
        expect.arrayContaining([
          'DATABASE_APP_PASSWORD',
          'REDIS_AUTH_TOKEN',
          'SESSION_COOKIE_SECRET',
          'CSRF_SECRET',
          'MFA_ENCRYPTION_KEY',
          'MEDIA_PRECACHE_SECRET',
        ]),
      );
    }
    expect(secretNames(ops)).toContain('DATABASE_OWNER_PASSWORD');

    // Secrets arrive only through `Secrets`, never as plain environment values.
    for (const c of all) {
      for (const name of Object.keys(envOf(c))) {
        expect(name).not.toMatch(/PASSWORD|SECRET|TOKEN|KEY$/);
      }
    }
  });

  it('sends email through SES from the domain identity, and only the API may send (ADR-0019)', () => {
    const api = containers(t.app).find((c) => c.Name === 'Api')!;
    expect(envOf(api)).toMatchObject({
      NOTIFICATION_TRANSPORT: 'ses',
      SES_FROM_ADDRESS: '"Example" <no-reply@example.ng>',
    });
    t.app.hasResourceProperties('AWS::SES::EmailIdentity', {
      EmailIdentity: 'example.ng',
      MailFromAttributes: { MailFromDomain: 'mail.example.ng' },
    });
    const sesPolicies = Object.values(t.app.findResources('AWS::IAM::Policy')).filter((p) =>
      JSON.stringify(p).includes('ses:SendEmail'),
    );
    expect(sesPolicies).toHaveLength(1);
    expect(JSON.stringify(sesPolicies[0])).toContain('ApiTaskTaskRole');
    expect(JSON.stringify(sesPolicies[0])).toContain(':identity/example.ng');
  });

  it('serves HTTPS only with a modern TLS policy, and redirects port 80', () => {
    t.app.hasResourceProperties('AWS::ElasticLoadBalancingV2::Listener', {
      Port: 443,
      Protocol: 'HTTPS',
      SslPolicy: Match.stringLikeRegexp('TLS13'),
    });
    t.app.hasResourceProperties('AWS::ElasticLoadBalancingV2::Listener', {
      Port: 80,
      DefaultActions: [Match.objectLike({ Type: 'redirect' })],
    });
    t.app.hasResourceProperties('AWS::ElasticLoadBalancingV2::TargetGroup', {
      HealthCheckPath: '/v1/health/ready',
    });
    t.app.resourceCountIs('AWS::WAFv2::WebACLAssociation', 1);
    // ADR-0022 amendment: every school's API host under one wildcard.
    t.app.hasResourceProperties('AWS::CertificateManager::Certificate', {
      DomainName: '*.api.example.ng',
      SubjectAlternativeNames: ['api.example.ng'],
      ValidationMethod: 'DNS',
    });
  });

  it('rolls a failed deployment back automatically and routes alarms to on-call', () => {
    t.app.hasResourceProperties('AWS::ECS::Service', {
      DeploymentConfiguration: Match.objectLike({
        DeploymentCircuitBreaker: { Enable: true, Rollback: true },
        MinimumHealthyPercent: 100,
      }),
    });
    t.app.hasResourceProperties('AWS::SNS::Subscription', {
      Protocol: 'email',
      Endpoint: 'oncall@example.ng',
    });
    const alarms = Object.values(t.app.findResources('AWS::CloudWatch::Alarm')) as {
      Properties: { AlarmActions: unknown[] };
    }[];
    expect(alarms.length).toBeGreaterThanOrEqual(8);
    for (const a of alarms) expect(a.Properties.AlarmActions).toHaveLength(1);
  });

  it('keeps images immutable so a rollback redeploys exactly the previous bytes', () => {
    t.registry.allResourcesProperties('AWS::ECR::Repository', {
      ImageTagMutability: 'IMMUTABLE',
      ImageScanningConfiguration: { ScanOnPush: true },
    });
  });

  it('lets only this repository’s matching GitHub environment assume the deploy role', () => {
    t.deploy.hasResourceProperties('AWS::IAM::Role', {
      AssumeRolePolicyDocument: {
        Statement: [
          Match.objectLike({
            Action: 'sts:AssumeRoleWithWebIdentity',
            Condition: {
              StringEquals: {
                'token.actions.githubusercontent.com:aud': 'sts.amazonaws.com',
                'token.actions.githubusercontent.com:sub': `repo:project-atlas-cbt/cbt-platform:environment:${environment}`,
              },
            },
          }),
        ],
      },
    });
  });

  it('isolates the data tier: no internet route, ingress only from the app tasks', () => {
    t.data.hasResourceProperties('AWS::RDS::DBInstance', {
      DBSubnetGroupName: Match.anyValue(),
    });
    const ingress = Object.values(t.data.findResources('AWS::EC2::SecurityGroupIngress')) as {
      Properties: { CidrIp?: string };
    }[];
    for (const rule of ingress) expect(rule.Properties.CidrIp).toBeUndefined();
  });
});

describe('production only', () => {
  const t = synth('production');
  it('protects data from deletion', () => {
    expect(t.stacks.data.terminationProtection).toBe(true);
    t.data.hasResource('AWS::RDS::DBInstance', { DeletionPolicy: 'Snapshot' });
    t.data.hasResource('AWS::S3::Bucket', { DeletionPolicy: 'Retain' });
  });
});
