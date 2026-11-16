CREATE TABLE "badges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"description" text NOT NULL,
	"image_id" uuid,
	"position" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "badges_image_id_unique" UNIQUE("image_id"),
	CONSTRAINT "badges_position_unique" UNIQUE("position") DEFERRABLE INITIALLY DEFERRED,
	CONSTRAINT "badges_name_length" CHECK (char_length("badges"."name") between 1 and 40),
	CONSTRAINT "badges_description_length" CHECK (char_length("badges"."description") between 1 and 200),
	CONSTRAINT "badges_position_nonnegative" CHECK ("badges"."position" >= 0)
);
--> statement-breakpoint
CREATE TABLE "user_badges" (
	"user_id" uuid NOT NULL,
	"badge_id" uuid NOT NULL,
	"granted_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_badges_user_id_badge_id_pk" PRIMARY KEY("user_id","badge_id")
);
--> statement-breakpoint
ALTER TABLE "user_badges" ADD CONSTRAINT "user_badges_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_badges" ADD CONSTRAINT "user_badges_badge_id_badges_id_fk" FOREIGN KEY ("badge_id") REFERENCES "public"."badges"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "badges_name_unique" ON "badges" USING btree (lower("name"));--> statement-breakpoint
CREATE INDEX "user_badges_badge_idx" ON "user_badges" USING btree ("badge_id");