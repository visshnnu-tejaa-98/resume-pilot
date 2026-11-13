import { App } from "aws-cdk-lib";
import { Match, Template } from "aws-cdk-lib/assertions";
import { beforeAll, describe, it } from "vitest";
import { getConfig } from "../lib/config.js";
import { DataStack } from "../lib/data-stack.js";
import { EcsStack } from "../lib/ecs-stack.js";
import { NetworkStack } from "../lib/network-stack.js";
import { ObservabilityStack } from "../lib/observability-stack.js";
import { SecretsStack } from "../lib/secrets-stack.js";
import { StorageStack } from "../lib/storage-stack.js";

describe("resume-pilot CDK app", () => {
  let network: NetworkStack;
  let storage: StorageStack;
  let secrets: SecretsStack;
  let data: DataStack;
  let ecs: EcsStack;
  let observability: ObservabilityStack;

  beforeAll(() => {
    const app = new App({
      context: {
        "resumePilot:maxAzs": 2,
        "resumePilot:natGateways": 1,
      },
    });
    const config = getConfig(app);

    network = new NetworkStack(app, "TestNetwork", {
      maxAzs: config.maxAzs,
      natGateways: config.natGateways,
    });
    storage = new StorageStack(app, "TestStorage");
    secrets = new SecretsStack(app, "TestSecrets");
    data = new DataStack(app, "TestData", {
      vpc: network.vpc,
      db: config.db,
      redis: config.redis,
    });
    ecs = new EcsStack(app, "TestEcs", {
      vpc: network.vpc,
      bucket: storage.bucket,
      dbInstance: data.dbInstance,
      dbSecurityGroup: data.dbSecurityGroup,
      redisCluster: data.redisCluster,
      redisSecurityGroup: data.redisSecurityGroup,
      clerkSecret: secrets.clerk,
      razorpaySecret: secrets.razorpay,
      openAiSecret: secrets.openai,
      sesSmtpSecret: secrets.sesSmtp,
      web: config.ecs.web,
      worker: config.ecs.worker,
      useBootstrapImage: config.useBootstrapImage,
      imageTag: config.imageTag,
    });
    observability = new ObservabilityStack(app, "TestObservability", {
      clusterName: ecs.cluster.clusterName,
      webServiceName: ecs.webService.service.serviceName,
      workerServiceName: ecs.workerService.serviceName,
      albFullName: ecs.webService.loadBalancer.loadBalancerFullName,
      dbInstanceId: data.dbInstance.instanceIdentifier,
      redisClusterId: data.redisCluster.ref,
      alarmEmail: "ops@example.com",
    });
  });

  it("creates exactly one VPC with the configured AZ count", () => {
    const template = Template.fromStack(network);
    template.resourceCountIs("AWS::EC2::VPC", 1);
    template.resourceCountIs("AWS::EC2::Subnet", 6); // 3 subnet tiers x 2 AZs
  });

  it("creates a private S3 bucket with Block Public Access and encryption", () => {
    const template = Template.fromStack(storage);
    template.hasResourceProperties("AWS::S3::Bucket", {
      PublicAccessBlockConfiguration: {
        BlockPublicAcls: true,
        BlockPublicPolicy: true,
        IgnorePublicAcls: true,
        RestrictPublicBuckets: true,
      },
      BucketEncryption: Match.objectLike({
        ServerSideEncryptionConfiguration: Match.arrayWith([
          Match.objectLike({
            ServerSideEncryptionByDefault: Match.objectLike({ SSEAlgorithm: "AES256" }),
          }),
        ]),
      }),
    });
  });

  it("expires objects tagged category=upload after 30 days, not the whole bucket", () => {
    const template = Template.fromStack(storage);
    template.hasResourceProperties("AWS::S3::Bucket", {
      LifecycleConfiguration: Match.objectLike({
        Rules: Match.arrayWith([
          Match.objectLike({
            ExpirationInDays: 30,
            TagFilters: [{ Key: "category", Value: "upload" }],
          }),
        ]),
      }),
    });
  });

  it("creates the 4 third-party credential secrets, not RDS credentials", () => {
    const template = Template.fromStack(secrets);
    template.resourceCountIs("AWS::SecretsManager::Secret", 4);
  });

  it("creates a non-publicly-accessible, encrypted RDS Postgres instance", () => {
    const template = Template.fromStack(data);
    template.hasResourceProperties("AWS::RDS::DBInstance", {
      Engine: "postgres",
      PubliclyAccessible: false,
      StorageEncrypted: true,
    });
  });

  it("creates an ElastiCache cluster defaulting to the valkey engine", () => {
    const template = Template.fromStack(data);
    template.hasResourceProperties("AWS::ElastiCache::CacheCluster", {
      Engine: "valkey",
    });
  });

  it("opens DB and cache ingress from the web/worker ECS task security groups", () => {
    // These ingress rules live on EcsStack's template, not DataStack's,
    // even though they target DataStack's dbSecurityGroup/
    // redisSecurityGroup — see the CfnSecurityGroupIngress comment in
    // ecs-stack.ts for why that direction matters (avoiding a stack
    // dependency cycle once useBootstrapImage is false).
    const template = Template.fromStack(ecs);
    // ALB -> web task (1) + {web, worker} x {Postgres, Redis} (4) = 5
    template.resourceCountIs("AWS::EC2::SecurityGroupIngress", 5);
    template.hasResourceProperties("AWS::EC2::SecurityGroupIngress", {
      FromPort: 5432,
      ToPort: 5432,
    });
    template.hasResourceProperties("AWS::EC2::SecurityGroupIngress", {
      FromPort: 6379,
      ToPort: 6379,
    });
  });

  it("creates an ECS cluster with a web service behind an ALB and a worker service with no public ingress", () => {
    const template = Template.fromStack(ecs);
    template.resourceCountIs("AWS::ECS::Cluster", 1);
    template.resourceCountIs("AWS::ECS::Service", 2);
    template.resourceCountIs("AWS::ElasticLoadBalancingV2::LoadBalancer", 1);
    template.hasResourceProperties("AWS::ElasticLoadBalancingV2::LoadBalancer", {
      Scheme: "internet-facing",
    });
  });

  it("creates ECR repositories for both web and worker images", () => {
    const template = Template.fromStack(ecs);
    template.resourceCountIs("AWS::ECR::Repository", 2);
  });

  it("creates a CloudFront distribution in front of the web ALB", () => {
    const template = Template.fromStack(ecs);
    template.resourceCountIs("AWS::CloudFront::Distribution", 1);
  });

  it("grants the task roles read/write on the files bucket", () => {
    const template = Template.fromStack(ecs);
    template.hasResourceProperties("AWS::IAM::Policy", {
      PolicyDocument: Match.objectLike({
        Statement: Match.arrayWith([
          Match.objectLike({
            Action: Match.arrayWith([Match.stringLikeRegexp("s3:GetObject")]),
          }),
        ]),
      }),
    });
  });

  it("creates a CloudWatch alarm topic with an email subscription when alarmEmail is set", () => {
    const template = Template.fromStack(observability);
    template.resourceCountIs("AWS::SNS::Topic", 1);
    template.hasResourceProperties("AWS::SNS::Subscription", {
      Protocol: "email",
      Endpoint: "ops@example.com",
    });
  });

  it("creates the 6 baseline alarms (ALB 5xx, web CPU, worker CPU, DB CPU, DB storage, cache CPU)", () => {
    const template = Template.fromStack(observability);
    template.resourceCountIs("AWS::CloudWatch::Alarm", 6);
  });
});
