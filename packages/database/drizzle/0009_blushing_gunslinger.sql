ALTER TYPE "public"."resume_status" ADD VALUE 'structuring';--> statement-breakpoint
ALTER TYPE "public"."resume_status" ADD VALUE 'ready';--> statement-breakpoint
CREATE UNIQUE INDEX "resume_versions_one_original_key" ON "resume_versions" USING btree ("resume_id") WHERE "resume_versions"."kind" = 'original';