import { Stack, type StackProps } from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import type { Construct } from 'constructs';
import { API_PORT, type AtlasEnvironment } from './config.js';

/**
 * Three-AZ VPC: public subnets hold only the load balancer and NAT; the
 * API and worker tasks run in private subnets; the database and cache sit
 * in isolated subnets with no route to the internet at all.
 */
export class NetworkStack extends Stack {
  readonly vpc: ec2.Vpc;
  /** API and worker tasks (and the one-off migration/ops task). */
  readonly appSecurityGroup: ec2.SecurityGroup;
  readonly loadBalancerSecurityGroup: ec2.SecurityGroup;

  /** Named, not looked up: synthesis needs no AWS credentials (CI, tests). */
  override get availabilityZones(): string[] {
    return this.zones;
  }

  private readonly zones: string[];

  constructor(scope: Construct, id: string, env: AtlasEnvironment, props: StackProps) {
    super(scope, id, props);
    this.zones = ['a', 'b', 'c'].map((az) => `${env.region}${az}`);

    this.vpc = new ec2.Vpc(this, 'Vpc', {
      ipAddresses: ec2.IpAddresses.cidr('10.40.0.0/16'),
      maxAzs: 3,
      natGateways: env.natGateways,
      subnetConfiguration: [
        { name: 'public', subnetType: ec2.SubnetType.PUBLIC, cidrMask: 24 },
        { name: 'app', subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS, cidrMask: 22 },
        { name: 'data', subnetType: ec2.SubnetType.PRIVATE_ISOLATED, cidrMask: 24 },
      ],
      flowLogs: {
        rejected: { trafficType: ec2.FlowLogTrafficType.REJECT },
      },
    });

    // Object storage traffic stays on the AWS network (and off the NAT bill).
    this.vpc.addGatewayEndpoint('S3Endpoint', { service: ec2.GatewayVpcEndpointAwsService.S3 });

    // The app and load balancer groups live here; the data tier's own
    // groups live in the data stack and admit these (one-way references,
    // no stack cycles). Task egress is open: the data tier's ingress rules
    // are the boundary, and tasks reach AWS APIs, Sentry and email over 443.
    this.appSecurityGroup = new ec2.SecurityGroup(this, 'AppSg', {
      vpc: this.vpc,
      description: 'Atlas API, worker and ops tasks',
      allowAllOutbound: true,
    });
    this.loadBalancerSecurityGroup = new ec2.SecurityGroup(this, 'AlbSg', {
      vpc: this.vpc,
      description: 'Public HTTPS load balancer',
      allowAllOutbound: false,
    });
    this.loadBalancerSecurityGroup.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(443), 'HTTPS');
    this.loadBalancerSecurityGroup.addIngressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(80),
      'redirect to HTTPS',
    );
    const api = ec2.Port.tcp(API_PORT);
    this.loadBalancerSecurityGroup.addEgressRule(this.appSecurityGroup, api, 'alb -> api');
    this.appSecurityGroup.addIngressRule(this.loadBalancerSecurityGroup, api, 'alb -> api');
  }
}
