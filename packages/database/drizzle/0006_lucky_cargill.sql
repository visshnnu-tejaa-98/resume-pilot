CREATE TABLE "code_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"code" text NOT NULL,
	"succeeded" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "code_redemptions" ADD COLUMN "flag_reason" text;--> statement-breakpoint
ALTER TABLE "code_redemptions" ADD COLUMN "ip_hash" text;--> statement-breakpoint
ALTER TABLE "code_redemptions" ADD COLUMN "device_hash" text;--> statement-breakpoint
ALTER TABLE "code_redemptions" ADD COLUMN "reviewed_by_user_id" uuid;--> statement-breakpoint
ALTER TABLE "code_redemptions" ADD COLUMN "reviewed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "code_attempts" ADD CONSTRAINT "code_attempts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "code_attempts_user_created_idx" ON "code_attempts" USING btree ("user_id","created_at");--> statement-breakpoint
ALTER TABLE "code_redemptions" ADD CONSTRAINT "code_redemptions_reviewed_by_user_id_users_id_fk" FOREIGN KEY ("reviewed_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "code_redemptions_referral_ip_idx" ON "code_redemptions" USING btree ("referral_code_id","ip_hash");--> statement-breakpoint
CREATE INDEX "code_redemptions_referral_device_idx" ON "code_redemptions" USING btree ("referral_code_id","device_hash");--> statement-breakpoint
CREATE INDEX "code_redemptions_coupon_id_idx" ON "code_redemptions" USING btree ("coupon_id");