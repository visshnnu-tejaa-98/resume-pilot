ALTER TABLE "resume_versions" DROP CONSTRAINT "resume_versions_jd_id_job_descriptions_id_fk";
--> statement-breakpoint
ALTER TABLE "ats_reports" DROP CONSTRAINT "ats_reports_jd_id_job_descriptions_id_fk";
--> statement-breakpoint
ALTER TABLE "resume_versions" ADD CONSTRAINT "resume_versions_jd_id_job_descriptions_id_fk" FOREIGN KEY ("jd_id") REFERENCES "public"."job_descriptions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ats_reports" ADD CONSTRAINT "ats_reports_jd_id_job_descriptions_id_fk" FOREIGN KEY ("jd_id") REFERENCES "public"."job_descriptions"("id") ON DELETE cascade ON UPDATE no action;