ALTER TABLE "resumes" ADD COLUMN "raw_text" text;--> statement-breakpoint
ALTER TABLE "resumes" ADD COLUMN "extraction_meta" jsonb;--> statement-breakpoint
ALTER TABLE "resumes" ADD COLUMN "extraction_error" text;