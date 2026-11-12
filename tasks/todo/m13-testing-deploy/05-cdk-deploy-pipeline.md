# CI/CD deploy pipeline

**Milestone:** M13 · prd.md §14.4
**Status:** todo

## Scope

- CI builds separate Docker images for `apps/web` and `apps/worker` from the monorepo
- Pipeline pushes images to ECR and triggers `cdk deploy` (or a CDK pipeline construct) to update the ECS services in `ap-south-1`
- Migrations (`drizzle-kit migrate`) run as a pipeline step before service deploy
- Secrets pulled from AWS Secrets Manager at deploy/runtime, never committed

## Done when

- A merge to main produces a deployed web + worker service with zero manual steps
