# AWS CDK infrastructure

**Milestone:** M1
**Status:** todo

## Scope

Build the `infra/` CDK app (TypeScript) provisioning everything in prd.md §14.4:

- VPC, RDS Postgres, ElastiCache Redis
- S3 bucket (private, Block Public Access, SSE, lifecycle rule on `uploads/`)
- ECS Fargate cluster + two services (web, worker) behind an ALB, CloudFront in front of web
- Secrets Manager entries for DB/Redis/Clerk/Razorpay/OpenAI/SES creds
- CloudWatch log groups + basic alarms
- Region `ap-south-1`

## Done when

- `cdk diff` / `cdk deploy` provisions a working dev environment from a clean AWS account
- Web and worker Docker images can be pushed and deployed to their ECS services
- Resource sizing left as CDK context params (not hardcoded) — see open decision in prd.md §16.4
