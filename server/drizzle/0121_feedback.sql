CREATE TYPE "public"."feedback_attachment_mime_type" AS ENUM('image/png', 'image/jpeg', 'image/webp');--> statement-breakpoint
CREATE TYPE "public"."feedback_kind" AS ENUM('bug', 'suggestion');--> statement-breakpoint
CREATE TYPE "public"."feedback_platform" AS ENUM('browser', 'desktop');--> statement-breakpoint
CREATE TABLE "feedback_attachments" (
	"id" uuid PRIMARY KEY NOT NULL,
	"feedback_id" uuid,
	"uploaded_by" uuid NOT NULL,
	"storage_key" text NOT NULL,
	"mime_type" "feedback_attachment_mime_type" NOT NULL,
	"size_bytes" integer NOT NULL,
	"width" integer NOT NULL,
	"height" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "feedback_attachments_storage_key_unique" UNIQUE("storage_key"),
	CONSTRAINT "feedback_attachments_size_positive" CHECK ("feedback_attachments"."size_bytes" > 0)
);
--> statement-breakpoint
CREATE TABLE "feedback_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sender_id" uuid NOT NULL,
	"sender_username" text NOT NULL,
	"kind" "feedback_kind" NOT NULL,
	"steps" text,
	"expected" text,
	"actual" text,
	"problem" text,
	"idea" text,
	"alternatives" text,
	"platform" "feedback_platform" NOT NULL,
	"app_version" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "feedback_entries_sections_of_kind" CHECK (("feedback_entries"."kind" = 'bug' and "feedback_entries"."steps" is not null and "feedback_entries"."expected" is not null and "feedback_entries"."actual" is not null and "feedback_entries"."problem" is null and "feedback_entries"."idea" is null and "feedback_entries"."alternatives" is null) or ("feedback_entries"."kind" = 'suggestion' and "feedback_entries"."problem" is not null and "feedback_entries"."idea" is not null and "feedback_entries"."steps" is null and "feedback_entries"."expected" is null and "feedback_entries"."actual" is null)),
	CONSTRAINT "feedback_entries_sections_length" CHECK (greatest(char_length("feedback_entries"."steps"), char_length("feedback_entries"."expected"), char_length("feedback_entries"."actual"), char_length("feedback_entries"."problem"), char_length("feedback_entries"."idea"), char_length("feedback_entries"."alternatives")) <= 2000),
	CONSTRAINT "feedback_entries_app_version_length" CHECK (char_length("feedback_entries"."app_version") <= 100)
);
--> statement-breakpoint
ALTER TABLE "feedback_attachments" ADD CONSTRAINT "feedback_attachments_feedback_id_feedback_entries_id_fk" FOREIGN KEY ("feedback_id") REFERENCES "public"."feedback_entries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feedback_attachments" ADD CONSTRAINT "feedback_attachments_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feedback_entries" ADD CONSTRAINT "feedback_entries_sender_id_users_id_fk" FOREIGN KEY ("sender_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "feedback_attachments_feedback_idx" ON "feedback_attachments" USING btree ("feedback_id");--> statement-breakpoint
CREATE INDEX "feedback_attachments_uploaded_by_idx" ON "feedback_attachments" USING btree ("uploaded_by");--> statement-breakpoint
CREATE INDEX "feedback_attachments_loose_created_idx" ON "feedback_attachments" USING btree ("created_at") WHERE "feedback_attachments"."feedback_id" is null;--> statement-breakpoint
CREATE INDEX "feedback_entries_created_idx" ON "feedback_entries" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "feedback_entries_sender_idx" ON "feedback_entries" USING btree ("sender_id");