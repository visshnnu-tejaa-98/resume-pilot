import type { App } from "aws-cdk-lib";
import * as ec2 from "aws-cdk-lib/aws-ec2";

/**
 * All resource sizing is read from CDK context (infra/cdk.json, or
 * `--context key=value` on the CLI) rather than hardcoded — see
 * prd.md §16.4 and tasks/todo/m1-foundation/02-aws-cdk-infra.md.
 */
export interface ResumePilotConfig {
  region: string;
  maxAzs: number;
  natGateways: number;
  db: {
    instanceClass: ec2.InstanceClass;
    instanceSize: ec2.InstanceSize;
    allocatedStorageGb: number;
    multiAz: boolean;
    deletionProtection: boolean;
  };
  redis: {
    /** ElastiCache engine — "valkey" (default, drop-in Redis replacement, no licensing fees) or "redis". */
    engine: string;
    nodeType: string;
    numCacheNodes: number;
  };
  ecs: {
    web: ScalingConfig;
    worker: ScalingConfig;
  };
  useBootstrapImage: boolean;
  imageTag: string;
  alarmEmail: string | undefined;
}

export interface ScalingConfig {
  cpu: number;
  memoryMiB: number;
  desiredCount: number;
  minCount: number;
  maxCount: number;
}

function ctx<T>(app: App, key: string, fallback: T): T {
  const value = app.node.tryGetContext(key);
  return value === undefined ? fallback : (value as T);
}

function instanceClassFrom(value: string): ec2.InstanceClass {
  const match = (ec2.InstanceClass as unknown as Record<string, ec2.InstanceClass>)[
    value.toUpperCase()
  ];
  if (!match) {
    throw new Error(`Unknown ec2.InstanceClass "${value}"`);
  }
  return match;
}

function instanceSizeFrom(value: string): ec2.InstanceSize {
  const match = (ec2.InstanceSize as unknown as Record<string, ec2.InstanceSize>)[
    value.toUpperCase()
  ];
  if (!match) {
    throw new Error(`Unknown ec2.InstanceSize "${value}"`);
  }
  return match;
}

export function getConfig(app: App): ResumePilotConfig {
  const scaling = (prefix: string): ScalingConfig => ({
    cpu: ctx(app, `resumePilot:ecs:${prefix}:cpu`, 512),
    memoryMiB: ctx(app, `resumePilot:ecs:${prefix}:memoryMiB`, 1024),
    desiredCount: ctx(app, `resumePilot:ecs:${prefix}:desiredCount`, 1),
    minCount: ctx(app, `resumePilot:ecs:${prefix}:minCount`, 1),
    maxCount: ctx(app, `resumePilot:ecs:${prefix}:maxCount`, 3),
  });

  return {
    region: ctx(app, "resumePilot:region", "ap-south-1"),
    maxAzs: ctx(app, "resumePilot:maxAzs", 2),
    natGateways: ctx(app, "resumePilot:natGateways", 1),
    db: {
      instanceClass: instanceClassFrom(ctx(app, "resumePilot:db:instanceClass", "t3")),
      instanceSize: instanceSizeFrom(ctx(app, "resumePilot:db:instanceSize", "micro")),
      allocatedStorageGb: ctx(app, "resumePilot:db:allocatedStorageGb", 20),
      multiAz: ctx(app, "resumePilot:db:multiAz", false),
      deletionProtection: ctx(app, "resumePilot:db:deletionProtection", false),
    },
    redis: {
      engine: ctx(app, "resumePilot:redis:engine", "valkey"),
      nodeType: ctx(app, "resumePilot:redis:nodeType", "cache.t4g.micro"),
      numCacheNodes: ctx(app, "resumePilot:redis:numCacheNodes", 1),
    },
    ecs: {
      web: scaling("web"),
      worker: scaling("worker"),
    },
    useBootstrapImage: ctx(app, "resumePilot:useBootstrapImage", true),
    imageTag: ctx(app, "resumePilot:imageTag", "latest"),
    alarmEmail: ctx(app, "resumePilot:alarmEmail", "") || undefined,
  };
}
