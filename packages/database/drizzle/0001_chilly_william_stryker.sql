ALTER TABLE "ai_jobs" ALTER COLUMN "pricing_config_version" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "pricing_config" ADD COLUMN "credit_value_inr" numeric(10, 4) DEFAULT '0.0500' NOT NULL;--> statement-breakpoint
ALTER TABLE "pricing_config" ADD COLUMN "created_by_user_id" uuid;--> statement-breakpoint
ALTER TABLE "pricing_config" ADD COLUMN "note" text;--> statement-breakpoint
ALTER TABLE "ai_jobs" ADD CONSTRAINT "ai_jobs_pricing_config_version_pricing_config_version_fk" FOREIGN KEY ("pricing_config_version") REFERENCES "public"."pricing_config"("version") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pricing_config" ADD CONSTRAINT "pricing_config_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "pricing_config_single_active_key" ON "pricing_config" USING btree ("active") WHERE "pricing_config"."active";--> statement-breakpoint
ALTER TABLE "pricing_config" ADD CONSTRAINT "pricing_config_usd_to_inr_positive" CHECK ("pricing_config"."usd_to_inr_rate" > 0);--> statement-breakpoint
ALTER TABLE "pricing_config" ADD CONSTRAINT "pricing_config_markup_positive" CHECK ("pricing_config"."markup_multiplier" > 0);--> statement-breakpoint
ALTER TABLE "pricing_config" ADD CONSTRAINT "pricing_config_credit_value_positive" CHECK ("pricing_config"."credit_value_inr" > 0);--> statement-breakpoint
ALTER TABLE "pricing_config" ADD CONSTRAINT "pricing_config_minimum_non_negative" CHECK ("pricing_config"."minimum_credits_per_action" >= 0);