CREATE TABLE "resume_files" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"resume_id" uuid NOT NULL,
	"page_index" integer NOT NULL,
	"storage_key" text NOT NULL,
	"storage_file_id" text,
	"mime_type" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "resume_files" ADD CONSTRAINT "resume_files_resume_id_resumes_id_fk" FOREIGN KEY ("resume_id") REFERENCES "public"."resumes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "resume_files_resume_page_key" ON "resume_files" USING btree ("resume_id","page_index");--> statement-breakpoint
ALTER TABLE "resumes" DROP COLUMN "storage_file_id";