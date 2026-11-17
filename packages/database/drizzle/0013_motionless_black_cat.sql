ALTER TABLE "users" ADD COLUMN "first_name" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "last_active_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "email_campaigns" ADD COLUMN "skipped_count" integer;--> statement-breakpoint
ALTER TABLE "email_campaigns" ADD COLUMN "started_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "email_campaigns" ADD COLUMN "finished_at" timestamp with time zone;