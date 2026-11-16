ALTER TYPE "public"."email_message_status" ADD VALUE 'skipped';--> statement-breakpoint
ALTER TABLE "email_messages" ADD COLUMN "error" text;