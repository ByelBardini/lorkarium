CREATE TABLE "mail_broadcast_deliveries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"broadcast_id" uuid NOT NULL,
	"user_id" uuid,
	"attempts" integer DEFAULT 0 NOT NULL,
	"claimed_until" timestamp with time zone,
	"sent_at" timestamp with time zone,
	"failed_at" timestamp with time zone,
	"skipped_at" timestamp with time zone,
	"error" text,
	CONSTRAINT "mail_broadcast_deliveries_one_end" CHECK (num_nonnulls("mail_broadcast_deliveries"."sent_at", "mail_broadcast_deliveries"."failed_at", "mail_broadcast_deliveries"."skipped_at") <= 1),
	CONSTRAINT "mail_broadcast_deliveries_error_length" CHECK (char_length("mail_broadcast_deliveries"."error") <= 500)
);
--> statement-breakpoint
CREATE TABLE "mail_broadcasts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"segment" jsonb NOT NULL,
	"subject" text NOT NULL,
	"title" text NOT NULL,
	"paragraphs" jsonb NOT NULL,
	"button" jsonb,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"tested_at" timestamp with time zone,
	"confirmed_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"total" integer,
	CONSTRAINT "mail_broadcasts_total_when_confirmed" CHECK (("mail_broadcasts"."confirmed_at" IS NULL) = ("mail_broadcasts"."total" IS NULL)),
	CONSTRAINT "mail_broadcasts_finished_after_confirmed" CHECK ("mail_broadcasts"."finished_at" IS NULL OR "mail_broadcasts"."confirmed_at" IS NOT NULL)
);
--> statement-breakpoint
ALTER TABLE "mail_broadcast_deliveries" ADD CONSTRAINT "mail_broadcast_deliveries_broadcast_id_mail_broadcasts_id_fk" FOREIGN KEY ("broadcast_id") REFERENCES "public"."mail_broadcasts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mail_broadcast_deliveries" ADD CONSTRAINT "mail_broadcast_deliveries_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mail_broadcasts" ADD CONSTRAINT "mail_broadcasts_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "mail_broadcast_deliveries_recipient_idx" ON "mail_broadcast_deliveries" USING btree ("broadcast_id","user_id");--> statement-breakpoint
CREATE INDEX "mail_broadcast_deliveries_pending_idx" ON "mail_broadcast_deliveries" USING btree ("broadcast_id") WHERE "mail_broadcast_deliveries"."sent_at" IS NULL AND "mail_broadcast_deliveries"."failed_at" IS NULL AND "mail_broadcast_deliveries"."skipped_at" IS NULL;--> statement-breakpoint
CREATE INDEX "mail_broadcasts_created_at_idx" ON "mail_broadcasts" USING btree ("created_at");