CREATE TYPE "public"."report_attachment_mime_type" AS ENUM('image/png', 'image/jpeg', 'image/webp');--> statement-breakpoint
CREATE TABLE "report_attachments" (
	"id" uuid PRIMARY KEY NOT NULL,
	"report_id" uuid,
	"uploaded_by" uuid,
	"storage_key" text NOT NULL,
	"mime_type" "report_attachment_mime_type" NOT NULL,
	"size_bytes" integer NOT NULL,
	"width" integer NOT NULL,
	"height" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "report_attachments_storage_key_unique" UNIQUE("storage_key"),
	CONSTRAINT "report_attachments_size_positive" CHECK ("report_attachments"."size_bytes" > 0)
);
--> statement-breakpoint
ALTER TABLE "user_reports" DROP CONSTRAINT "user_reports_reporter_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "user_reports" DROP CONSTRAINT "user_reports_target_id_users_id_fk";
--> statement-breakpoint
DROP INDEX "user_reports_open_pair_idx";--> statement-breakpoint
ALTER TABLE "user_reports" ALTER COLUMN "reporter_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "user_reports" ALTER COLUMN "target_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "user_reports" ADD COLUMN "reporter_username" text;--> statement-breakpoint
ALTER TABLE "user_reports" ADD COLUMN "target_username" text;--> statement-breakpoint
ALTER TABLE "user_reports" ADD COLUMN "target_name" text;--> statement-breakpoint
UPDATE "user_reports" SET "reporter_username" = "reporter"."username" FROM "users" AS "reporter" WHERE "reporter"."id" = "user_reports"."reporter_id";--> statement-breakpoint
UPDATE "user_reports" SET "target_username" = "target"."username", "target_name" = "target"."name" FROM "users" AS "target" WHERE "target"."id" = "user_reports"."target_id";--> statement-breakpoint
ALTER TABLE "user_reports" ALTER COLUMN "reporter_username" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "user_reports" ALTER COLUMN "target_username" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "user_reports" ALTER COLUMN "target_name" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "user_reports" ADD COLUMN "campaign_id" uuid;--> statement-breakpoint
ALTER TABLE "user_reports" ADD COLUMN "campaign_name" text;--> statement-breakpoint
ALTER TABLE "user_reports" ADD COLUMN "admin_note" text;--> statement-breakpoint
ALTER TABLE "report_attachments" ADD CONSTRAINT "report_attachments_report_id_user_reports_id_fk" FOREIGN KEY ("report_id") REFERENCES "public"."user_reports"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_attachments" ADD CONSTRAINT "report_attachments_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "report_attachments_report_idx" ON "report_attachments" USING btree ("report_id");--> statement-breakpoint
CREATE INDEX "report_attachments_uploaded_by_idx" ON "report_attachments" USING btree ("uploaded_by");--> statement-breakpoint
CREATE INDEX "report_attachments_loose_created_idx" ON "report_attachments" USING btree ("created_at") WHERE "report_attachments"."report_id" is null;--> statement-breakpoint
ALTER TABLE "user_reports" ADD CONSTRAINT "user_reports_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_reports" ADD CONSTRAINT "user_reports_reporter_id_users_id_fk" FOREIGN KEY ("reporter_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_reports" ADD CONSTRAINT "user_reports_target_id_users_id_fk" FOREIGN KEY ("target_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "user_reports_reporter_idx" ON "user_reports" USING btree ("reporter_id");--> statement-breakpoint
CREATE INDEX "user_reports_campaign_idx" ON "user_reports" USING btree ("campaign_id");--> statement-breakpoint
CREATE INDEX "user_reports_resolved_at_idx" ON "user_reports" USING btree ("resolved_at");--> statement-breakpoint
CREATE UNIQUE INDEX "user_reports_open_pair_idx" ON "user_reports" USING btree ("reporter_id","target_id") WHERE "user_reports"."status" = 'open' and "user_reports"."reporter_id" is not null and "user_reports"."target_id" is not null;--> statement-breakpoint
ALTER TABLE "user_reports" ADD CONSTRAINT "user_reports_admin_note_length" CHECK (char_length("user_reports"."admin_note") <= 2000);--> statement-breakpoint
ALTER TABLE "user_reports" ADD CONSTRAINT "user_reports_campaign_named" CHECK ("user_reports"."campaign_id" is null or "user_reports"."campaign_name" is not null);