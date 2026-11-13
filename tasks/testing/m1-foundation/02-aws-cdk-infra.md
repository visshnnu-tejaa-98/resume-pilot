# AWS CDK infrastructure

**Milestone:** M1
**Status:** testing — code written, synth-tested; real `cdk deploy` blocked on AWS credentials

## Scope

Build the `infra/` CDK app (TypeScript) provisioning everything in prd.md §14.4:

- VPC, RDS Postgres, ElastiCache Redis
- S3 bucket (private, Block Public Access, SSE, lifecycle rule on `uploads/`)
- ECS Fargate cluster + two services (web, worker) behind an ALB, CloudFront in front of web
- Secrets Manager entries for DB/Redis/Clerk/Razorpay/OpenAI/SES creds
- CloudWatch log groups + basic alarms
- Region `ap-south-1`

## Done when

- `cdk diff` / `cdk deploy` provisions a working dev environment from a clean AWS account — **blocked**: no AWS account/credentials available in this environment yet. The user will provide IAM access keys later; until then this can't move to `done/`.
- Web and worker Docker images can be pushed and deployed to their ECS services — code supports this (see bootstrap-image notes below), unverified against a real ECR/ECS until credentials exist.
- Resource sizing left as CDK context params (not hardcoded) — **done**, see `infra/cdk.json`.

## What was built

`infra/` — a CDK v2 TypeScript app, 6 stacks:

- `NetworkStack` — VPC (public / private-with-egress / private-isolated subnets across `maxAzs` AZs, configurable NAT gateway count).
- `StorageStack` — private S3 bucket (Block Public Access, SSE, GET-only CORS for presigned downloads — no PUT, per prd.md §5.2's "browser never gets write access"). Lifecycle rule expires objects **tagged `category=upload`** after 30 days, not a `users/*/uploads/` prefix — S3 lifecycle rules can't glob a dynamic per-user prefix, so the upload wrapper (`tasks/todo/m3-upload-storage/01`) must tag objects itself.
- `SecretsStack` — 4 placeholder Secrets Manager secrets (Clerk, Razorpay, OpenAI, SES SMTP) with `REPLACE_ME` values to fill in manually post-deploy, never from code. RDS credentials are *not* here — `DataStack` auto-generates them via `rds.Credentials.fromGeneratedSecret`.
- `DataStack` — RDS Postgres 16 (private-isolated subnet, encrypted, not publicly accessible) + ElastiCache, engine defaulting to **Valkey** (not Redis OSS — drop-in protocol-compatible, no licensing fees, works with BullMQ/ioredis unchanged; switch back via `-c resumePilot:redis:engine=redis`).
- `EcsStack` — ECR repos (web, worker) with image lifecycle rules; ECS cluster; web service via `ApplicationLoadBalancedFargateService` (public ALB, CloudFront in front, health check on `/`); worker service with no public ingress; CPU-based autoscaling for both (see note below on queue-depth); task role S3 grants; DB/Redis secrets and connection info injected as container env/secrets.
- `ObservabilityStack` — SNS alarm topic (+ optional email subscription via `resumePilot:alarmEmail`), 6 CloudWatch alarms: ALB 5xx rate, web CPU, worker CPU, RDS CPU, RDS free storage, cache CPU.

All sizing (instance classes, Fargate CPU/memory, AZ/NAT counts, scaling min/max) comes from `infra/cdk.json` context, overridable via `--context key=value` — nothing hardcoded, matching the open decision in prd.md §16.4.

### `useBootstrapImage` — solving the chicken-and-egg deploy problem

Before any image has ever been pushed, the ECR repos are empty and a first `cdk deploy` referencing them fails outright. `resumePilot:useBootstrapImage` (default `true` in `cdk.json`) points both services at small public placeholder images (`httpd`, `busybox`) instead, with no env/secrets attached, so the very first deploy succeeds and creates the ECR repos. Once CI has pushed real images, redeploy with `--context resumePilot:useBootstrapImage=false --context resumePilot:imageTag=<tag>` to switch to the real app images with full env/secrets wiring.

### A real cross-stack dependency cycle, found and fixed by actually running `cdk synth`

First version shared one `appSecurityGroup` (owned by `NetworkStack`) between the ALB-fronted web service and the DB/Redis ingress rules. `cdk synth` failed immediately with a `DependencyCycle` error: the ALB pattern construct auto-wires an ingress rule *onto* whatever security group you hand its tasks (allowing traffic from the ALB's own SG) — mutating a security group owned by an *earlier* stack forces that earlier stack to reference back into the ALB's stack, creating a cycle.

Fix: removed the shared security group entirely. `EcsStack` now owns its own web/worker task security groups, created locally. Then — second bug, caught by actually inspecting `cdk.out/manifest.json`'s dependency graph, not just by synth succeeding — using `dbSecurityGroup.addIngressRule(ecsTaskSG, port)` from `EcsStack` still attached the new rule resource to `DataStack` (CDK attaches a security group rule to whichever stack owns the `SecurityGroup` *object*, regardless of which stack's code calls the method), creating `DataStack -> EcsStack` as a new edge. This was **latent**: with `useBootstrapImage: true` (the default), `EcsStack` never dereferences any `DataStack` attribute, so the reverse edge didn't collide with anything and `cdk synth` passed silently — it would only have broken the moment a real deploy flipped `useBootstrapImage` to `false`. Fixed by using the low-level `ec2.CfnSecurityGroupIngress` construct scoped explicitly to `EcsStack` instead of the `.addIngressRule()` convenience method, so the rule resource lives in `EcsStack`'s own template. Verified the fix holds by synthesizing with `--context resumePilot:useBootstrapImage=false --context resumePilot:imageTag=v1` (the configuration that would have exposed it) and inspecting `manifest.json` to confirm the dependency graph is a clean DAG with no `Data -> Ecs` edge.

### Known gaps / honest limitations

- Worker autoscaling is CPU-based, not queue-depth-based. prd.md §14.4 says "scaled on queue depth," but BullMQ has no built-in CloudWatch integration — that needs the worker to publish a custom metric itself, which doesn't exist yet. CPU scaling is the honest baseline until that metric is built.
- ElastiCache is a single-node `CfnCacheCluster`, not a `CfnReplicationGroup` — no automatic failover. Fine for dev/early production; upgrading to multi-AZ replication is a deliberate follow-up once traffic justifies it.
- `cdk bootstrap` / `cdk deploy` have not been run against a real account — see "Done when" above.

## Verified (without AWS credentials)

- `pnpm synth` — clean, zero warnings, with the default (`useBootstrapImage: true`) config.
- `pnpm synth --context resumePilot:useBootstrapImage=false --context resumePilot:imageTag=v1` — clean, confirming the real-deploy configuration doesn't hit the dependency cycle.
- `pnpm test` (Vitest + `aws-cdk-lib/assertions`) — 13/13 pass: VPC/subnet counts, S3 Block Public Access + encryption + tag-scoped lifecycle rule, exactly 4 non-RDS secrets, RDS not publicly accessible + encrypted, ElastiCache engine is `valkey`, DB/Redis ingress rules exist and are scoped to the ECS task security groups, ECS cluster/services/ALB/CloudFront/ECR counts, S3 IAM grant on task roles, SNS topic + email subscription, all 6 alarms.
- `pnpm lint` / `pnpm build` (`tsc --noEmit`) — clean.
- `pnpm diff` — fails with exactly "Unable to resolve AWS account to use," confirming the code itself is correct and the only blocker is credentials.

## Next step

Needs AWS IAM access keys (user chose to provide these once available — not a root account, an IAM user with sufficient permissions for VPC/RDS/ElastiCache/S3/ECS/ALB/CloudFront/Secrets Manager/CloudWatch). Once provided: `pnpm bootstrap` once per account/region, then `pnpm deploy` (or deploy stack-by-stack). Expect ~$80-150+/month in ongoing cost (NAT gateway, RDS, ElastiCache, ALB run 24/7 even idle) — flagged to the user before any real deploy runs.

### What to provide, and how to get it from the AWS console

1. **Create an IAM user** (not root): console → IAM → Users → Create user. Name it e.g. `resume-pilot-cdk-deploy`. Programmatic access only — don't enable console login.
2. **Attach permissions**: for a first deploy covering VPC/RDS/ElastiCache/S3/ECS/ALB/CloudFront/Secrets Manager/CloudWatch/IAM-role-creation, the simplest correct option is the `AdministratorAccess` managed policy — CDK needs broad permissions (including creating IAM roles for the ECS tasks) that are fiddly to hand-scope correctly. Tighten later once the stacks are stable.
3. **Generate an access key**: on that user → Security credentials tab → Access keys → Create access key → choose "Command Line Interface (CLI)" → Create. AWS shows the secret exactly once — copy both values now (or download the `.csv`).
4. **Also note your AWS account ID** (top-right account menu in the console, or Account → Account Id).

Hand these three values to me:

```
AWS_ACCESS_KEY_ID=AKIA...
AWS_SECRET_ACCESS_KEY=...
AWS_ACCOUNT_ID=123456789012
```

I'll export them as env vars for the session only (never written to a file in this repo). Afterward, rotate or delete that access key from the same IAM console page — it doesn't need to stay live once the deploy is done.
