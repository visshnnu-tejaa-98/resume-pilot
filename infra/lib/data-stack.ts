import { Duration, RemovalPolicy, Stack, type StackProps, Tags } from "aws-cdk-lib";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as elasticache from "aws-cdk-lib/aws-elasticache";
import * as rds from "aws-cdk-lib/aws-rds";
import type { Construct } from "constructs";

export interface DataStackProps extends StackProps {
  vpc: ec2.Vpc;
  db: {
    instanceClass: ec2.InstanceClass;
    instanceSize: ec2.InstanceSize;
    allocatedStorageGb: number;
    multiAz: boolean;
    deletionProtection: boolean;
  };
  redis: {
    engine: string;
    nodeType: string;
    numCacheNodes: number;
  };
}

/**
 * RDS Postgres + ElastiCache — prd.md §14.4.
 *
 * The cache engine defaults to **Valkey**, not Redis OSS: it's the
 * drop-in, protocol-compatible fork ElastiCache now manages natively,
 * costs less, and avoids Redis Inc.'s source-available licensing. BullMQ
 * and ioredis talk to it exactly as they would talk to Redis — nothing
 * in apps/worker needs to change. Set `resumePilot:redis:engine=redis`
 * via context to use real Redis OSS instead if ever needed.
 *
 * It's also a single-node `CfnCacheCluster`, not a
 * `CfnReplicationGroup`. That's fine for dev/early production (BullMQ
 * doesn't need HA to function) but has no automatic failover; upgrading
 * to a replication group with multi-AZ is a follow-up once traffic
 * justifies it — not done here to keep this stack's scope matched to
 * what M1 actually needs.
 *
 * Ingress on `dbSecurityGroup`/`redisSecurityGroup` is deliberately left
 * empty here — EcsStack (created after this stack, and already
 * dependent on it for `dbInstance`/`redisCluster`) adds the ingress
 * rules once its own task security groups exist. Doing it the other way
 * around — this stack reaching forward into EcsStack's security groups —
 * creates a stack dependency cycle, since the ALB construct also wires
 * an ingress rule back onto whatever security group you hand its tasks.
 */
export class DataStack extends Stack {
  public readonly dbInstance: rds.DatabaseInstance;
  public readonly dbSecurityGroup: ec2.SecurityGroup;
  public readonly redisCluster: elasticache.CfnCacheCluster;
  public readonly redisSecurityGroup: ec2.SecurityGroup;

  constructor(scope: Construct, id: string, props: DataStackProps) {
    super(scope, id, props);

    this.dbSecurityGroup = new ec2.SecurityGroup(this, "DbSecurityGroup", {
      vpc: props.vpc,
      description: "RDS Postgres - resume-pilot",
      allowAllOutbound: false,
    });

    this.dbInstance = new rds.DatabaseInstance(this, "Database", {
      engine: rds.DatabaseInstanceEngine.postgres({
        version: rds.PostgresEngineVersion.VER_16_4,
      }),
      vpc: props.vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_ISOLATED },
      instanceType: ec2.InstanceType.of(props.db.instanceClass, props.db.instanceSize),
      allocatedStorage: props.db.allocatedStorageGb,
      multiAz: props.db.multiAz,
      credentials: rds.Credentials.fromGeneratedSecret("resume_pilot_admin", {
        secretName: "resume-pilot/db/credentials",
      }),
      databaseName: "resume_pilot",
      securityGroups: [this.dbSecurityGroup],
      removalPolicy: RemovalPolicy.SNAPSHOT,
      deletionProtection: props.db.deletionProtection,
      storageEncrypted: true,
      publiclyAccessible: false,
      backupRetention: Duration.days(7),
    });

    this.redisSecurityGroup = new ec2.SecurityGroup(this, "RedisSecurityGroup", {
      vpc: props.vpc,
      description: "ElastiCache - resume-pilot",
      allowAllOutbound: false,
    });

    const redisSubnetGroup = new elasticache.CfnSubnetGroup(this, "RedisSubnetGroup", {
      description: "Private isolated subnets for ElastiCache",
      subnetIds: props.vpc.selectSubnets({
        subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
      }).subnetIds,
    });

    this.redisCluster = new elasticache.CfnCacheCluster(this, "RedisCluster", {
      engine: props.redis.engine,
      cacheNodeType: props.redis.nodeType,
      numCacheNodes: props.redis.numCacheNodes,
      vpcSecurityGroupIds: [this.redisSecurityGroup.securityGroupId],
      cacheSubnetGroupName: redisSubnetGroup.ref,
    });
    this.redisCluster.addResourceDependency(redisSubnetGroup);

    Tags.of(this).add("Project", "resume-pilot");
  }
}
