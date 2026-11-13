CREATE TYPE "public"."ai_job_status" AS ENUM('pending', 'running', 'succeeded', 'failed');--> statement-breakpoint
CREATE TYPE "public"."ai_job_type" AS ENUM('jd_analysis', 'generation', 'ats_scoring');--> statement-breakpoint
CREATE TYPE "public"."ats_report_status" AS ENUM('current', 'outdated');--> statement-breakpoint
CREATE TYPE "public"."code_type" AS ENUM('coupon', 'referral');--> statement-breakpoint
CREATE TYPE "public"."credit_hold_status" AS ENUM('active', 'captured', 'released');--> statement-breakpoint
CREATE TYPE "public"."credit_ledger_type" AS ENUM('purchase', 'capture', 'refund', 'admin_adjustment', 'coupon_credit', 'referral_credit');--> statement-breakpoint
CREATE TYPE "public"."email_campaign_status" AS ENUM('draft', 'scheduled', 'sending', 'sent', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."email_message_status" AS ENUM('queued', 'sent', 'delivered', 'opened', 'clicked', 'bounced', 'failed', 'unsubscribed');--> statement-breakpoint
CREATE TYPE "public"."email_suppression_reason" AS ENUM('hard_bounce', 'complaint', 'unsubscribe_all');--> statement-breakpoint
CREATE TYPE "public"."payment_status" AS ENUM('created', 'captured', 'failed', 'refunded');--> statement-breakpoint
CREATE TYPE "public"."referrer_status" AS ENUM('granted', 'held', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."resume_format" AS ENUM('tex', 'pdf', 'docx', 'png', 'jpg', 'jpeg');--> statement-breakpoint
CREATE TYPE "public"."resume_status" AS ENUM('uploaded', 'processing', 'processed', 'failed');--> statement-breakpoint
CREATE TYPE "public"."resume_version_kind" AS ENUM('original', 'generated');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('user', 'admin');--> statement-breakpoint
CREATE TYPE "public"."user_status" AS ENUM('active', 'suspended');--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clerk_user_id" text NOT NULL,
	"email" text NOT NULL,
	"role" "user_role" DEFAULT 'user' NOT NULL,
	"status" "user_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "resume_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"resume_id" uuid NOT NULL,
	"kind" "resume_version_kind" NOT NULL,
	"content" jsonb NOT NULL,
	"extraction_meta" jsonb,
	"provenance" jsonb,
	"parent_version_id" uuid,
	"jd_id" uuid,
	"content_hash" text NOT NULL,
	"template_id" uuid,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "resumes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"file_key" text NOT NULL,
	"file_name" text NOT NULL,
	"file_format" "resume_format" NOT NULL,
	"file_hash" text NOT NULL,
	"status" "resume_status" DEFAULT 'uploaded' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "jd_analyses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"jd_id" uuid NOT NULL,
	"job_title" text,
	"seniority" text,
	"min_years_experience" integer,
	"requirements" jsonb NOT NULL,
	"education_requirements" jsonb,
	"domain_terms" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "job_descriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"text" text NOT NULL,
	"company_name" text,
	"job_title" text,
	"posting_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "job_descriptions_text_length_check" CHECK (char_length(btrim("job_descriptions"."text")) between 200 and 30000)
);
--> statement-breakpoint
CREATE TABLE "generated_files" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"version_id" uuid NOT NULL,
	"template_id" uuid NOT NULL,
	"content_hash" text NOT NULL,
	"s3_key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "resume_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"type" "ai_job_type" NOT NULL,
	"status" "ai_job_status" DEFAULT 'pending' NOT NULL,
	"model" text,
	"input_tokens" integer,
	"output_tokens" integer,
	"cost_paise" integer,
	"credits_estimated" integer NOT NULL,
	"credits_charged" integer,
	"pricing_config_version" integer,
	"idempotency_key" text NOT NULL,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ats_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"version_id" uuid NOT NULL,
	"jd_id" uuid NOT NULL,
	"content_hash" text NOT NULL,
	"method_version" text NOT NULL,
	"overall_score" integer NOT NULL,
	"breakdown" jsonb NOT NULL,
	"report" jsonb NOT NULL,
	"status" "ats_report_status" DEFAULT 'current' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "credit_packages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"price_paise" integer NOT NULL,
	"credits" integer NOT NULL,
	"bonus_credits" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pricing_config" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"version" integer NOT NULL,
	"model_prices" jsonb NOT NULL,
	"usd_to_inr_rate" numeric(10, 4) NOT NULL,
	"markup_multiplier" numeric(6, 3) NOT NULL,
	"minimum_credits_per_action" integer NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "credit_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"balance" bigint DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "credit_accounts_balance_non_negative_check" CHECK ("credit_accounts"."balance" >= 0)
);
--> statement-breakpoint
CREATE TABLE "credit_holds" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"ai_job_id" uuid NOT NULL,
	"amount" bigint NOT NULL,
	"status" "credit_hold_status" DEFAULT 'active' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "credit_ledger" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"type" "credit_ledger_type" NOT NULL,
	"credits" bigint NOT NULL,
	"balance_after" bigint NOT NULL,
	"source_type" text NOT NULL,
	"source_id" uuid NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "code_redemptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"code_type" "code_type" NOT NULL,
	"coupon_id" uuid,
	"referral_code_id" uuid,
	"credits_to_user" integer NOT NULL,
	"credits_to_referrer" integer DEFAULT 0 NOT NULL,
	"referrer_status" "referrer_status" DEFAULT 'granted' NOT NULL,
	"flagged_for_abuse" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "coupons" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"credits" integer NOT NULL,
	"max_redemptions" integer,
	"expires_at" timestamp with time zone,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "referral_codes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"code" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payment_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"payment_id" uuid,
	"event_id" text NOT NULL,
	"event_type" text NOT NULL,
	"payload" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"package_id" uuid,
	"order_id" text NOT NULL,
	"payment_id" text,
	"amount_paise" integer NOT NULL,
	"credits" integer NOT NULL,
	"status" "payment_status" DEFAULT 'created' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"admin_user_id" uuid NOT NULL,
	"action" text NOT NULL,
	"target_type" text,
	"target_id" uuid,
	"reason" text NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "email_campaigns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"template_key" text NOT NULL,
	"audience_filters" jsonb NOT NULL,
	"subject" text NOT NULL,
	"preheader" text,
	"content" jsonb NOT NULL,
	"status" "email_campaign_status" DEFAULT 'draft' NOT NULL,
	"scheduled_at" timestamp with time zone,
	"created_by" uuid NOT NULL,
	"recipient_count" integer,
	"sent_count" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "email_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"message_id" uuid,
	"sns_message_id" text NOT NULL,
	"event_type" text NOT NULL,
	"payload" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "email_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"template_key" text NOT NULL,
	"campaign_id" uuid,
	"status" "email_message_status" DEFAULT 'queued' NOT NULL,
	"ses_message_id" text,
	"idempotency_key" text NOT NULL,
	"merge_data" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "email_preferences" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"reminders" boolean DEFAULT false NOT NULL,
	"product_updates" boolean DEFAULT false NOT NULL,
	"offers" boolean DEFAULT false NOT NULL,
	"consent_source" text,
	"consent_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "email_suppressions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"reason" "email_suppression_reason" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "email_template_settings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"template_key" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"settings" jsonb,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "resume_versions" ADD CONSTRAINT "resume_versions_resume_id_resumes_id_fk" FOREIGN KEY ("resume_id") REFERENCES "public"."resumes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resume_versions" ADD CONSTRAINT "resume_versions_parent_version_id_resume_versions_id_fk" FOREIGN KEY ("parent_version_id") REFERENCES "public"."resume_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resume_versions" ADD CONSTRAINT "resume_versions_jd_id_job_descriptions_id_fk" FOREIGN KEY ("jd_id") REFERENCES "public"."job_descriptions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resume_versions" ADD CONSTRAINT "resume_versions_template_id_resume_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."resume_templates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resumes" ADD CONSTRAINT "resumes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jd_analyses" ADD CONSTRAINT "jd_analyses_jd_id_job_descriptions_id_fk" FOREIGN KEY ("jd_id") REFERENCES "public"."job_descriptions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_descriptions" ADD CONSTRAINT "job_descriptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "generated_files" ADD CONSTRAINT "generated_files_version_id_resume_versions_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."resume_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "generated_files" ADD CONSTRAINT "generated_files_template_id_resume_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."resume_templates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_jobs" ADD CONSTRAINT "ai_jobs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ats_reports" ADD CONSTRAINT "ats_reports_version_id_resume_versions_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."resume_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ats_reports" ADD CONSTRAINT "ats_reports_jd_id_job_descriptions_id_fk" FOREIGN KEY ("jd_id") REFERENCES "public"."job_descriptions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_accounts" ADD CONSTRAINT "credit_accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_holds" ADD CONSTRAINT "credit_holds_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_holds" ADD CONSTRAINT "credit_holds_ai_job_id_ai_jobs_id_fk" FOREIGN KEY ("ai_job_id") REFERENCES "public"."ai_jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_ledger" ADD CONSTRAINT "credit_ledger_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "code_redemptions" ADD CONSTRAINT "code_redemptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "code_redemptions" ADD CONSTRAINT "code_redemptions_coupon_id_coupons_id_fk" FOREIGN KEY ("coupon_id") REFERENCES "public"."coupons"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "code_redemptions" ADD CONSTRAINT "code_redemptions_referral_code_id_referral_codes_id_fk" FOREIGN KEY ("referral_code_id") REFERENCES "public"."referral_codes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "referral_codes" ADD CONSTRAINT "referral_codes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_events" ADD CONSTRAINT "payment_events_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_package_id_credit_packages_id_fk" FOREIGN KEY ("package_id") REFERENCES "public"."credit_packages"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_admin_user_id_users_id_fk" FOREIGN KEY ("admin_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_campaigns" ADD CONSTRAINT "email_campaigns_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_events" ADD CONSTRAINT "email_events_message_id_email_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."email_messages"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_messages" ADD CONSTRAINT "email_messages_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_messages" ADD CONSTRAINT "email_messages_campaign_id_email_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."email_campaigns"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_preferences" ADD CONSTRAINT "email_preferences_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "users_clerk_user_id_key" ON "users" USING btree ("clerk_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "resumes_user_id_file_hash_key" ON "resumes" USING btree ("user_id","file_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "jd_analyses_jd_id_key" ON "jd_analyses" USING btree ("jd_id");--> statement-breakpoint
CREATE UNIQUE INDEX "generated_files_version_hash_template_key" ON "generated_files" USING btree ("version_id","content_hash","template_id");--> statement-breakpoint
CREATE UNIQUE INDEX "resume_templates_key_key" ON "resume_templates" USING btree ("key");--> statement-breakpoint
CREATE UNIQUE INDEX "ai_jobs_idempotency_key_key" ON "ai_jobs" USING btree ("idempotency_key");--> statement-breakpoint
CREATE INDEX "ats_reports_version_hash_jd_idx" ON "ats_reports" USING btree ("version_id","content_hash","jd_id");--> statement-breakpoint
CREATE UNIQUE INDEX "credit_packages_price_paise_key" ON "credit_packages" USING btree ("price_paise");--> statement-breakpoint
CREATE UNIQUE INDEX "pricing_config_version_key" ON "pricing_config" USING btree ("version");--> statement-breakpoint
CREATE UNIQUE INDEX "credit_accounts_user_id_key" ON "credit_accounts" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "credit_holds_ai_job_id_key" ON "credit_holds" USING btree ("ai_job_id");--> statement-breakpoint
CREATE UNIQUE INDEX "credit_ledger_source_type_source_id_key" ON "credit_ledger" USING btree ("source_type","source_id");--> statement-breakpoint
CREATE UNIQUE INDEX "code_redemptions_user_id_key" ON "code_redemptions" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "coupons_lower_code_key" ON "coupons" USING btree (lower("code"));--> statement-breakpoint
CREATE UNIQUE INDEX "referral_codes_user_id_key" ON "referral_codes" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "referral_codes_lower_code_key" ON "referral_codes" USING btree (lower("code"));--> statement-breakpoint
CREATE UNIQUE INDEX "payment_events_event_id_key" ON "payment_events" USING btree ("event_id");--> statement-breakpoint
CREATE UNIQUE INDEX "payments_order_id_key" ON "payments" USING btree ("order_id");--> statement-breakpoint
CREATE UNIQUE INDEX "payments_payment_id_key" ON "payments" USING btree ("payment_id");--> statement-breakpoint
CREATE UNIQUE INDEX "email_events_sns_message_id_key" ON "email_events" USING btree ("sns_message_id");--> statement-breakpoint
CREATE UNIQUE INDEX "email_messages_idempotency_key_key" ON "email_messages" USING btree ("idempotency_key");--> statement-breakpoint
CREATE UNIQUE INDEX "email_messages_ses_message_id_key" ON "email_messages" USING btree ("ses_message_id");--> statement-breakpoint
CREATE UNIQUE INDEX "email_preferences_user_id_key" ON "email_preferences" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "email_suppressions_lower_email_key" ON "email_suppressions" USING btree (lower("email"));--> statement-breakpoint
CREATE UNIQUE INDEX "email_template_settings_template_key_key" ON "email_template_settings" USING btree ("template_key");