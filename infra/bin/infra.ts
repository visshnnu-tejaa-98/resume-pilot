#!/usr/bin/env node
import { App } from "aws-cdk-lib";
import { getConfig } from "../lib/config.js";
import { DataStack } from "../lib/data-stack.js";
import { EcsStack } from "../lib/ecs-stack.js";
import { NetworkStack } from "../lib/network-stack.js";
import { ObservabilityStack } from "../lib/observability-stack.js";
import { SecretsStack } from "../lib/secrets-stack.js";
import { StorageStack } from "../lib/storage-stack.js";

const app = new App();
const config = getConfig(app);

// Stacks are environment-agnostic (no `env` prop) by default, which lets
// `cdk synth` run with no AWS credentials at all — CDK falls back to
// placeholder AZs instead of looking them up. Real deploys pass account
// and region explicitly: `cdk deploy --all -c resumePilot:region=ap-south-1`
// after `export CDK_DEFAULT_ACCOUNT=...` or via an AWS CLI profile, which
// is when CDK does its one-time (cached) AZ lookup for ap-south-1.

const network = new NetworkStack(app, "ResumePilot-Network", {
  maxAzs: config.maxAzs,
  natGateways: config.natGateways,
});

const storage = new StorageStack(app, "ResumePilot-Storage");

const secrets = new SecretsStack(app, "ResumePilot-Secrets");

const data = new DataStack(app, "ResumePilot-Data", {
  vpc: network.vpc,
  db: config.db,
  redis: config.redis,
});

const ecs = new EcsStack(app, "ResumePilot-Ecs", {
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

new ObservabilityStack(app, "ResumePilot-Observability", {
  clusterName: ecs.cluster.clusterName,
  webServiceName: ecs.webService.service.serviceName,
  workerServiceName: ecs.workerService.serviceName,
  albFullName: ecs.webService.loadBalancer.loadBalancerFullName,
  dbInstanceId: data.dbInstance.instanceIdentifier,
  redisClusterId: data.redisCluster.ref,
  alarmEmail: config.alarmEmail,
});

app.synth();
