ALTER TABLE "resume_versions" ADD COLUMN "generation_meta" jsonb;--> statement-breakpoint
ALTER TABLE "ai_jobs" ADD COLUMN "input" jsonb;--> statement-breakpoint
ALTER TABLE "ai_jobs" ADD COLUMN "result_version_id" uuid;