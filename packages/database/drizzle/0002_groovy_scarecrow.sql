ALTER TABLE "generated_files" RENAME COLUMN "s3_key" TO "storage_key";--> statement-breakpoint
ALTER TABLE "email_events" RENAME COLUMN "sns_message_id" TO "provider_event_id";--> statement-breakpoint
ALTER TABLE "email_messages" RENAME COLUMN "ses_message_id" TO "provider_message_id";--> statement-breakpoint
DROP INDEX "email_events_sns_message_id_key";--> statement-breakpoint
DROP INDEX "email_messages_ses_message_id_key";--> statement-breakpoint
ALTER TABLE "resumes" ADD COLUMN "storage_file_id" text;--> statement-breakpoint
ALTER TABLE "generated_files" ADD COLUMN "storage_file_id" text NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "email_events_provider_event_id_key" ON "email_events" USING btree ("provider_event_id");--> statement-breakpoint
CREATE UNIQUE INDEX "email_messages_provider_message_id_key" ON "email_messages" USING btree ("provider_message_id");