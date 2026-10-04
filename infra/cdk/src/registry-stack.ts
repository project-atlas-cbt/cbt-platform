import { RemovalPolicy, Stack, type StackProps } from 'aws-cdk-lib';
import * as ecr from 'aws-cdk-lib/aws-ecr';
import type { Construct } from 'constructs';
import type { AtlasEnvironment } from './config.js';

/**
 * Image repositories, deployed before anything that runs an image so the
 * first push has somewhere to land. Tags are immutable: a release tag
 * always means the same bytes, which is what makes rollback ("redeploy the
 * previous tag") safe.
 */
export class RegistryStack extends Stack {
  readonly server: ecr.Repository;
  readonly ops: ecr.Repository;

  constructor(scope: Construct, id: string, env: AtlasEnvironment, props: StackProps) {
    super(scope, id, props);
    const repo = (logicalId: string, name: string) =>
      new ecr.Repository(this, logicalId, {
        repositoryName: `atlas-${env.name}-${name}`,
        imageTagMutability: ecr.TagMutability.IMMUTABLE,
        imageScanOnPush: true,
        encryption: ecr.RepositoryEncryption.KMS,
        // Keep enough history to roll back across several releases.
        lifecycleRules: [{ maxImageCount: 30, description: 'keep the last 30 images' }],
        removalPolicy: env.protectData ? RemovalPolicy.RETAIN : RemovalPolicy.DESTROY,
        emptyOnDelete: !env.protectData,
      });
    this.server = repo('ServerRepository', 'server');
    this.ops = repo('OpsRepository', 'ops');
  }
}
