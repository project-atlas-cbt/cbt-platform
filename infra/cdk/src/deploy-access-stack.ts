import { Duration, Stack, type StackProps } from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam';
import type { Construct } from 'constructs';
import { GITHUB_REPOSITORY, type AtlasEnvironment } from './config.js';

export interface DeployAccessStackProps extends StackProps {
  /** An existing GitHub OIDC provider in this account, if there is one. */
  readonly githubOidcProviderArn?: string;
}

/**
 * The only identity CI/CD deploys with: a role GitHub Actions assumes by
 * OIDC (no long-lived keys in GitHub), trusted only for this repository's
 * matching GitHub environment — so the `production` role can be assumed
 * only by a job that passed that environment's required reviewer.
 *
 * It may push images, run the migration task, and drive `cdk deploy`
 * through the CDK bootstrap roles. It cannot read application data.
 */
export class DeployAccessStack extends Stack {
  readonly role: iam.Role;

  constructor(scope: Construct, id: string, env: AtlasEnvironment, props: DeployAccessStackProps) {
    super(scope, id, props);

    const provider = props.githubOidcProviderArn
      ? iam.OpenIdConnectProvider.fromOpenIdConnectProviderArn(
          this,
          'GitHubOidc',
          props.githubOidcProviderArn,
        )
      : new iam.OpenIdConnectProvider(this, 'GitHubOidc', {
          url: 'https://token.actions.githubusercontent.com',
          clientIds: ['sts.amazonaws.com'],
        });

    this.role = new iam.Role(this, 'DeployRole', {
      roleName: `atlas-${env.name}-github-deploy`,
      maxSessionDuration: Duration.hours(1),
      assumedBy: new iam.WebIdentityPrincipal(provider.openIdConnectProviderArn, {
        StringEquals: {
          'token.actions.githubusercontent.com:aud': 'sts.amazonaws.com',
          'token.actions.githubusercontent.com:sub': `repo:${GITHUB_REPOSITORY}:environment:${env.githubEnvironment}`,
        },
      }),
      description: `GitHub Actions deploys to ${env.name} (environment-scoped OIDC)`,
    });

    // `cdk deploy` acts through the bootstrap roles (cdk bootstrap).
    this.role.addToPolicy(
      new iam.PolicyStatement({
        actions: ['sts:AssumeRole'],
        resources: [`arn:aws:iam::${this.account}:role/cdk-*`],
      }),
    );
    // Image push to this environment's repositories only.
    this.role.addToPolicy(
      new iam.PolicyStatement({ actions: ['ecr:GetAuthorizationToken'], resources: ['*'] }),
    );
    this.role.addToPolicy(
      new iam.PolicyStatement({
        actions: [
          'ecr:BatchCheckLayerAvailability',
          'ecr:BatchGetImage',
          'ecr:CompleteLayerUpload',
          'ecr:DescribeImages',
          'ecr:InitiateLayerUpload',
          'ecr:PutImage',
          'ecr:UploadLayerPart',
        ],
        resources: [`arn:aws:ecr:${this.region}:${this.account}:repository/atlas-${env.name}-*`],
      }),
    );
    // Run the migration task and watch it; read stack outputs.
    this.role.addToPolicy(
      new iam.PolicyStatement({
        actions: ['ecs:RunTask', 'ecs:DescribeTasks', 'ecs:DescribeServices', 'ecs:ListTasks'],
        resources: ['*'],
        conditions: {
          ArnLike: {
            'ecs:cluster': `arn:aws:ecs:${this.region}:${this.account}:cluster/Atlas-${env.name}-*`,
          },
        },
      }),
    );
    // The migration runs the new release's ops image before any service
    // changes: a new revision of the ops task definition is registered with
    // that image (the roles it may carry are limited by PassRole below).
    this.role.addToPolicy(
      new iam.PolicyStatement({
        actions: ['ecs:DescribeTaskDefinition', 'ecs:RegisterTaskDefinition'],
        resources: ['*'],
      }),
    );
    this.role.addToPolicy(
      new iam.PolicyStatement({
        actions: ['iam:PassRole'],
        resources: [`arn:aws:iam::${this.account}:role/Atlas-${env.name}-App-*`],
        conditions: { StringEquals: { 'iam:PassedToService': 'ecs-tasks.amazonaws.com' } },
      }),
    );
    this.role.addToPolicy(
      new iam.PolicyStatement({
        actions: ['cloudformation:DescribeStacks', 'logs:GetLogEvents', 'logs:FilterLogEvents'],
        resources: ['*'],
      }),
    );
  }
}
