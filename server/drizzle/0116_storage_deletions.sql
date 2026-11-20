CREATE TABLE "storage_deletions" (
	"key" text PRIMARY KEY NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"enqueued_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "storage_deletions_next_attempt_at_idx" ON "storage_deletions" USING btree ("next_attempt_at");