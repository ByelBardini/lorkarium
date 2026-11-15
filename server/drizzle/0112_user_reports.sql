CREATE TYPE "public"."user_report_reason" AS ENUM('harassment', 'hate_speech', 'spam', 'cheating', 'inappropriate_content', 'impersonation', 'other');--> statement-breakpoint
CREATE TYPE "public"."user_report_status" AS ENUM('open', 'resolved', 'dismissed');--> statement-breakpoint
CREATE TABLE "user_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reporter_id" uuid NOT NULL,
	"target_id" uuid NOT NULL,
	"reason" "user_report_reason" NOT NULL,
	"details" text,
	"status" "user_report_status" DEFAULT 'open' NOT NULL,
	"resolved_by" uuid,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_reports_details_length" CHECK (char_length("user_reports"."details") <= 1000),
	CONSTRAINT "user_reports_not_self" CHECK ("user_reports"."reporter_id" <> "user_reports"."target_id"),
	CONSTRAINT "user_reports_resolved_at_when_closed" CHECK (("user_reports"."status" = 'open') = ("user_reports"."resolved_at" is null))
);
--> statement-breakpoint
ALTER TABLE "user_reports" ADD CONSTRAINT "user_reports_reporter_id_users_id_fk" FOREIGN KEY ("reporter_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_reports" ADD CONSTRAINT "user_reports_target_id_users_id_fk" FOREIGN KEY ("target_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_reports" ADD CONSTRAINT "user_reports_resolved_by_users_id_fk" FOREIGN KEY ("resolved_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "user_reports_open_pair_idx" ON "user_reports" USING btree ("reporter_id","target_id") WHERE "user_reports"."status" = 'open';--> statement-breakpoint
CREATE INDEX "user_reports_status_created_idx" ON "user_reports" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "user_reports_target_idx" ON "user_reports" USING btree ("target_id");