CREATE TYPE "public"."appeal_outcome" AS ENUM('upheld', 'reverted');--> statement-breakpoint
CREATE TYPE "public"."sanction_kind" AS ENUM('warning', 'content_removal', 'suspension', 'ban');--> statement-breakpoint
CREATE TYPE "public"."sanction_rule" AS ENUM('harassment', 'adult_content', 'copyright', 'ai_content', 'sheet_code', 'service_abuse', 'accounts', 'spam', 'paid_tables', 'security_testing', 'reputation_reports');--> statement-breakpoint
CREATE TABLE "account_sanctions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" "sanction_kind" NOT NULL,
	"rule" "sanction_rule" NOT NULL,
	"statement" text NOT NULL,
	"until" timestamp with time zone,
	"report_id" uuid,
	"issued_by" uuid,
	"issued_at" timestamp with time zone DEFAULT now() NOT NULL,
	"appeal_received_at" timestamp with time zone,
	"appeal_outcome" "appeal_outcome",
	"appeal_note" text,
	"appeal_decided_by" uuid,
	"appeal_decided_at" timestamp with time zone,
	CONSTRAINT "account_sanctions_statement_length" CHECK (char_length("account_sanctions"."statement") BETWEEN 1 AND 2000),
	CONSTRAINT "account_sanctions_until_only_suspension" CHECK ("account_sanctions"."until" IS NULL OR "account_sanctions"."kind" = 'suspension'),
	CONSTRAINT "account_sanctions_appeal_note_length" CHECK (char_length("account_sanctions"."appeal_note") <= 2000),
	CONSTRAINT "account_sanctions_appeal_decision_whole" CHECK (("account_sanctions"."appeal_outcome" IS NULL) = ("account_sanctions"."appeal_note" IS NULL) AND ("account_sanctions"."appeal_outcome" IS NULL) = ("account_sanctions"."appeal_decided_at" IS NULL)),
	CONSTRAINT "account_sanctions_appeal_received_first" CHECK ("account_sanctions"."appeal_outcome" IS NULL OR "account_sanctions"."appeal_received_at" IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "banned_email_indexes" (
	"email_index" text PRIMARY KEY NOT NULL,
	"banned_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "suspended_until" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "account_sanctions" ADD CONSTRAINT "account_sanctions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account_sanctions" ADD CONSTRAINT "account_sanctions_report_id_user_reports_id_fk" FOREIGN KEY ("report_id") REFERENCES "public"."user_reports"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account_sanctions" ADD CONSTRAINT "account_sanctions_issued_by_users_id_fk" FOREIGN KEY ("issued_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account_sanctions" ADD CONSTRAINT "account_sanctions_appeal_decided_by_users_id_fk" FOREIGN KEY ("appeal_decided_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "account_sanctions_user_issued_idx" ON "account_sanctions" USING btree ("user_id","issued_at");--> statement-breakpoint
CREATE INDEX "banned_email_indexes_banned_at_idx" ON "banned_email_indexes" USING btree ("banned_at");--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_suspended_until_with_suspension" CHECK ("users"."suspended_until" IS NULL OR "users"."suspended_at" IS NOT NULL);