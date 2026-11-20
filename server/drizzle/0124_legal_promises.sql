ALTER TYPE "public"."sanction_rule" ADD VALUE 'minimum_age';--> statement-breakpoint
ALTER TYPE "public"."user_report_reason" ADD VALUE 'underage' BEFORE 'other';--> statement-breakpoint
ALTER TABLE "account_sanctions" ADD COLUMN "deletion_due_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "account_sanctions" ADD COLUMN "delete_shared_campaigns" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "account_sanctions" ADD COLUMN "notified_at" timestamp with time zone;--> statement-breakpoint
-- The measures already applied had their e-mail sent (or lost) back then: none is retried.
UPDATE "account_sanctions" SET "notified_at" = "issued_at";--> statement-breakpoint
CREATE INDEX "account_sanctions_deletion_due_idx" ON "account_sanctions" USING btree ("deletion_due_at");--> statement-breakpoint
CREATE INDEX "account_sanctions_unnotified_idx" ON "account_sanctions" USING btree ("issued_at") WHERE notified_at IS NULL;--> statement-breakpoint
ALTER TABLE "account_sanctions" ADD CONSTRAINT "account_sanctions_deletion_only_ban" CHECK (("account_sanctions"."deletion_due_at" IS NULL AND NOT "account_sanctions"."delete_shared_campaigns") OR "account_sanctions"."kind" = 'ban');