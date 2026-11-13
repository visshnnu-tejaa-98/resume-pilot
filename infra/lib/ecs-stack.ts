import { Duration, Stack, type StackProps, Tags } from "aws-cdk-lib";
import * as cloudfront from "aws-cdk-lib/aws-cloudfront";
import * as origins from "aws-cdk-lib/aws-cloudfront-origins";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as ecr from "aws-cdk-lib/aws-ecr";
import * as ecs from "aws-cdk-lib/aws-ecs";
import * as ecsPatterns from "aws-cdk-lib/aws-ecs-patterns";
import * as elasticache from "aws-cdk-lib/aws-elasticache";
import * as logs from "aws-cdk-lib/aws-logs";
import * as rds from "aws-cdk-lib/aws-rds";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as secretsmanager from "aws-cdk-lib/aws-secretsmanager";
import type { Construct } from "constructs";
import type { ScalingConfig } from "./config.js";

export interface EcsStackProps extends StackProps {
  vpc: ec2.Vpc;
  bucket: s3.Bucket;
  dbInstance: rds.DatabaseInstance;
  dbSecurityGroup: ec2.SecurityGroup;
  redisCluster: elasticache.CfnCacheCluster;
  redisSecurityGroup: ec2.SecurityGroup;
  clerkSecret: secretsmanager.Secret;
  razorpaySecret: secretsmanager.Secret;
  openAiSecret: secretsmanager.Secret;
  sesSmtpSecret: secretsmanager.Secret;
  web: ScalingConfig;
  worker: ScalingConfig;
  /**
   * Before any real image has been pushed, the web/worker ECR repos are
   * empty and an ECS deploy referencing them fails outright. Set true
   * (the cdk.json default) for the first-ever deploy — it points both
   * services at a public placeholder image instead — then flip to
   * false via `--context resumePilot:useBootstrapImage=false` once CI
   * has pushed real images (tasks/todo/m13-testing-deploy/05).
   */
  useBootstrapImage: boolean;
  imageTag: string;
}

export class EcsStack extends Stack {
  public readonly cluster: ecs.Cluster;
  public readonly webRepository: ecr.Repository;
  public readonly workerRepository: ecr.Repository;
  public readonly webService: ecsPatterns.ApplicationLoadBalancedFargateService;
  public readonly workerService: ecs.FargateService;
  public readonly distribution: cloudfront.Distribution;

  constructor(scope: Construct, id: string, props: EcsStackProps) {
    super(scope, id, props);

    this.webRepository = new ecr.Repository(this, "WebRepository", {
      repositoryName: "resume-pilot/web",
      imageScanOnPush: true,
      lifecycleRules: [{ maxImageCount: 20, tagStatus: ecr.TagStatus.ANY }],
    });

    this.workerRepository = new ecr.Repository(this, "WorkerRepository", {
      repositoryName: "resume-pilot/worker",
      imageScanOnPush: true,
      lifecycleRules: [{ maxImageCount: 20, tagStatus: ecr.TagStatus.ANY }],
    });

    this.cluster = new ecs.Cluster(this, "Cluster", {
      vpc: props.vpc,
      clusterName: "resume-pilot",
      containerInsightsV2: ecs.ContainerInsights.ENABLED,
    });

    const dbUrlFromSecret = (field: string) =>
      ecs.Secret.fromSecretsManager(props.dbInstance.secret!, field);

    const sharedEnv: Record<string, string> = {
      NODE_ENV: "production",
      AWS_REGION: this.region,
      S3_BUCKET_NAME: props.bucket.bucketName,
      REDIS_URL: `redis://${props.redisCluster.attrRedisEndpointAddress}:${props.redisCluster.attrRedisEndpointPort}`,
      DB_HOST: props.dbInstance.dbInstanceEndpointAddress,
      DB_PORT: props.dbInstance.dbInstanceEndpointPort,
      DB_NAME: "resume_pilot",
    };

    const sharedSecrets: Record<string, ecs.Secret> = {
      DB_USERNAME: dbUrlFromSecret("username"),
      DB_PASSWORD: dbUrlFromSecret("password"),
      CLERK_SECRET_KEY: ecs.Secret.fromSecretsManager(props.clerkSecret, "CLERK_SECRET_KEY"),
      CLERK_WEBHOOK_SECRET: ecs.Secret.fromSecretsManager(
        props.clerkSecret,
        "CLERK_WEBHOOK_SECRET",
      ),
      RAZORPAY_KEY_ID: ecs.Secret.fromSecretsManager(props.razorpaySecret, "RAZORPAY_KEY_ID"),
      RAZORPAY_KEY_SECRET: ecs.Secret.fromSecretsManager(
        props.razorpaySecret,
        "RAZORPAY_KEY_SECRET",
      ),
      RAZORPAY_WEBHOOK_SECRET: ecs.Secret.fromSecretsManager(
        props.razorpaySecret,
        "RAZORPAY_WEBHOOK_SECRET",
      ),
      OPENAI_API_KEY: ecs.Secret.fromSecretsManager(props.openAiSecret, "OPENAI_API_KEY"),
      SES_SMTP_USER: ecs.Secret.fromSecretsManager(props.sesSmtpSecret, "SES_SMTP_USER"),
      SES_SMTP_PASSWORD: ecs.Secret.fromSecretsManager(props.sesSmtpSecret, "SES_SMTP_PASSWORD"),
    };

    // Each service owns its own security group, created here in
    // EcsStack.
    const webServiceSecurityGroup = new ec2.SecurityGroup(this, "WebServiceSecurityGroup", {
      vpc: props.vpc,
      description: "resume-pilot web ECS tasks",
      allowAllOutbound: true,
    });
    const workerServiceSecurityGroup = new ec2.SecurityGroup(this, "WorkerServiceSecurityGroup", {
      vpc: props.vpc,
      description: "resume-pilot worker ECS tasks",
      allowAllOutbound: true,
    });

    // Deliberately NOT `props.dbSecurityGroup.addIngressRule(...)`: that
    // convenience method attaches the new rule resource to whichever
    // stack owns the security group object — DataStack, here — which
    // would force DataStack to import EcsStack's SG id and create a
    // stack dependency cycle the moment EcsStack also dereferences any
    // DataStack attribute (which it does, once useBootstrapImage is
    // false). Using the low-level CfnSecurityGroupIngress construct
    // scoped to `this` (EcsStack) keeps the rule resource — and the
    // only new cross-stack reference it needs, DataStack's SG id — a
    // plain forward reference, matching the dependency EcsStack already
    // has on DataStack.
    for (const [name, sg] of [
      ["Web", webServiceSecurityGroup],
      ["Worker", workerServiceSecurityGroup],
    ] as const) {
      new ec2.CfnSecurityGroupIngress(this, `${name}ToDbIngress`, {
        groupId: props.dbSecurityGroup.securityGroupId,
        sourceSecurityGroupId: sg.securityGroupId,
        ipProtocol: "tcp",
        fromPort: 5432,
        toPort: 5432,
        description: `${name} ECS task -> Postgres`,
      });
      new ec2.CfnSecurityGroupIngress(this, `${name}ToRedisIngress`, {
        groupId: props.redisSecurityGroup.securityGroupId,
        sourceSecurityGroupId: sg.securityGroupId,
        ipProtocol: "tcp",
        fromPort: 6379,
        toPort: 6379,
        description: `${name} ECS task -> Redis/Valkey`,
      });
    }

    const webImage = props.useBootstrapImage
      ? ecs.ContainerImage.fromRegistry("public.ecr.aws/docker/library/httpd:2.4")
      : ecs.ContainerImage.fromEcrRepository(this.webRepository, props.imageTag);

    const workerImage = props.useBootstrapImage
      ? ecs.ContainerImage.fromRegistry("public.ecr.aws/docker/library/busybox:1.36")
      : ecs.ContainerImage.fromEcrRepository(this.workerRepository, props.imageTag);

    // --- Web: ALB-fronted Fargate service -----------------------------
    this.webService = new ecsPatterns.ApplicationLoadBalancedFargateService(this, "WebService", {
      cluster: this.cluster,
      serviceName: "resume-pilot-web",
      cpu: props.web.cpu,
      memoryLimitMiB: props.web.memoryMiB,
      desiredCount: props.web.desiredCount,
      publicLoadBalancer: true,
      securityGroups: [webServiceSecurityGroup],
      circuitBreaker: { rollback: true },
      minHealthyPercent: 100,
      taskImageOptions: {
        image: webImage,
        containerPort: props.useBootstrapImage ? 80 : 3000,
        environment: props.useBootstrapImage ? undefined : sharedEnv,
        secrets: props.useBootstrapImage ? undefined : sharedSecrets,
        logDriver: ecs.LogDrivers.awsLogs({
          streamPrefix: "web",
          logGroup: new logs.LogGroup(this, "WebLogGroup", {
            logGroupName: "/resume-pilot/web",
            retention: logs.RetentionDays.ONE_MONTH,
          }),
        }),
      },
    });
    this.webService.targetGroup.configureHealthCheck({ path: "/" });

    const webScaling = this.webService.service.autoScaleTaskCount({
      minCapacity: props.web.minCount,
      maxCapacity: props.web.maxCount,
    });
    webScaling.scaleOnCpuUtilization("WebCpuScaling", {
      targetUtilizationPercent: 70,
      scaleInCooldown: Duration.seconds(60),
      scaleOutCooldown: Duration.seconds(60),
    });

    // --- Worker: no public ingress, scaled on CPU for now --------------
    // prd.md §14.4 says "scaled on queue depth"; that needs a custom
    // CloudWatch metric the worker publishes itself (BullMQ has no
    // built-in CloudWatch integration). Not built yet — CPU-based
    // scaling is the honest baseline until that metric exists.
    const workerTaskDefinition = new ecs.FargateTaskDefinition(this, "WorkerTaskDef", {
      cpu: props.worker.cpu,
      memoryLimitMiB: props.worker.memoryMiB,
    });
    workerTaskDefinition.addContainer("worker", {
      image: workerImage,
      environment: props.useBootstrapImage ? undefined : sharedEnv,
      secrets: props.useBootstrapImage ? undefined : sharedSecrets,
      command: props.useBootstrapImage ? ["sleep", "infinity"] : undefined,
      logging: ecs.LogDrivers.awsLogs({
        streamPrefix: "worker",
        logGroup: new logs.LogGroup(this, "WorkerLogGroup", {
          logGroupName: "/resume-pilot/worker",
          retention: logs.RetentionDays.ONE_MONTH,
        }),
      }),
    });

    this.workerService = new ecs.FargateService(this, "WorkerService", {
      cluster: this.cluster,
      serviceName: "resume-pilot-worker",
      taskDefinition: workerTaskDefinition,
      desiredCount: props.worker.desiredCount,
      securityGroups: [workerServiceSecurityGroup],
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      circuitBreaker: { rollback: true },
      minHealthyPercent: 100,
    });

    const workerScaling = this.workerService.autoScaleTaskCount({
      minCapacity: props.worker.minCount,
      maxCapacity: props.worker.maxCount,
    });
    workerScaling.scaleOnCpuUtilization("WorkerCpuScaling", {
      targetUtilizationPercent: 70,
      scaleInCooldown: Duration.seconds(60),
      scaleOutCooldown: Duration.seconds(60),
    });

    // --- Permissions -----------------------------------------------------
    props.bucket.grantReadWrite(this.webService.taskDefinition.taskRole);
    props.bucket.grantReadWrite(workerTaskDefinition.taskRole);

    // --- CloudFront in front of the web ALB -------------------------------
    this.distribution = new cloudfront.Distribution(this, "WebDistribution", {
      comment: "resume-pilot web",
      defaultBehavior: {
        origin: new origins.LoadBalancerV2Origin(this.webService.loadBalancer, {
          protocolPolicy: cloudfront.OriginProtocolPolicy.HTTP_ONLY,
        }),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
        cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
        originRequestPolicy: cloudfront.OriginRequestPolicy.ALL_VIEWER,
      },
    });

    Tags.of(this).add("Project", "resume-pilot");
  }
}
