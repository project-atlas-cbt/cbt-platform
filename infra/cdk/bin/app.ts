#!/usr/bin/env node
import { App } from 'aws-cdk-lib';
import { buildEnvironment, optionsFromContext } from '../src/build.js';

// One environment per invocation, e.g.
//   pnpm cdk deploy --all -c environment=staging -c rootDomain=<root> \
//     -c imageTag=<sha> -c productName=<name> -c alarmEmails=a@x,b@y
// See docs/operations/infrastructure.md.
const app = new App();
buildEnvironment(app, optionsFromContext(app));
app.synth();
