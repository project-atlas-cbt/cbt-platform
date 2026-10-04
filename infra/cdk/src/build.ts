import type { App } from 'aws-cdk-lib';
import { Tags } from 'aws-cdk-lib';
import { AppStack } from './app-stack.js';
import { ENVIRONMENTS, type DeployInputs, type EnvironmentName } from './config.js';
import { DataStack } from './data-stack.js';
import { DeployAccessStack } from './deploy-access-stack.js';
import { NetworkStack } from './network-stack.js';
import { RegistryStack } from './registry-stack.js';

export interface BuildOptions {
  readonly environment: EnvironmentName;
  readonly account?: string;
  readonly inputs: DeployInputs;
  readonly githubOidcProviderArn?: string;
}

/** Builds one environment's stacks into `app`. Shared by bin/ and tests. */
export function buildEnvironment(app: App, options: BuildOptions) {
  const env = ENVIRONMENTS[options.environment];
  const prefix = `Atlas-${env.name}`;
  const stackEnv = { region: env.region, ...(options.account ? { account: options.account } : {}) };
  const common = { env: stackEnv, terminationProtection: env.protectData };

  const network = new NetworkStack(app, `${prefix}-Network`, env, common);
  const registry = new RegistryStack(app, `${prefix}-Registry`, env, common);
  const data = new DataStack(app, `${prefix}-Data`, env, {
    ...common,
    network,
    rootDomain: options.inputs.rootDomain,
  });
  const application = new AppStack(app, `${prefix}-App`, env, {
    ...common,
    network,
    data,
    registry,
    inputs: options.inputs,
  });
  const deployAccess = new DeployAccessStack(app, `${prefix}-DeployAccess`, env, {
    ...common,
    ...(options.githubOidcProviderArn
      ? { githubOidcProviderArn: options.githubOidcProviderArn }
      : {}),
  });

  for (const stack of [network, registry, data, application, deployAccess]) {
    Tags.of(stack).add('project', 'atlas');
    Tags.of(stack).add('environment', env.name);
  }
  return { network, registry, data, application, deployAccess };
}

/** Reads CDK context (`-c key=value`) into build options; fails loudly. */
export function optionsFromContext(app: App): BuildOptions {
  const get = (key: string): string | undefined => {
    const value: unknown = app.node.tryGetContext(key);
    return typeof value === 'string' && value.length > 0 ? value : undefined;
  };
  const require = (key: string): string => {
    const value = get(key);
    if (!value) throw new Error(`CDK context "${key}" is required (cdk ... -c ${key}=...)`);
    return value;
  };
  const environment = require('environment');
  if (environment !== 'staging' && environment !== 'production') {
    throw new Error('CDK context "environment" must be staging or production');
  }
  const certificate = get('apiCertificateArn');
  const sentryDsn = get('sentryDsn');
  const account = get('account') ?? process.env.CDK_DEFAULT_ACCOUNT;
  const oidc = get('githubOidcProviderArn');
  return {
    environment,
    ...(account ? { account } : {}),
    ...(oidc ? { githubOidcProviderArn: oidc } : {}),
    inputs: {
      rootDomain: require('rootDomain'),
      imageTag: require('imageTag'),
      productName: require('productName'),
      alarmEmails: (get('alarmEmails') ?? '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
      ...(certificate ? { apiCertificateArn: certificate } : {}),
      ...(sentryDsn ? { sentryDsn } : {}),
      ...(get('bootstrap') === 'true' ? { bootstrap: true } : {}),
    },
  };
}
