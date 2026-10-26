CREATE TABLE "saved_rolls" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"name_key" text NOT NULL,
	"parts" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "saved_rolls_name_length" CHECK (char_length("saved_rolls"."name") BETWEEN 1 AND 40)
);
--> statement-breakpoint
ALTER TABLE "saved_rolls" ADD CONSTRAINT "saved_rolls_member_fk" FOREIGN KEY ("campaign_id","user_id") REFERENCES "public"."campaign_members"("campaign_id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "saved_rolls_member_name_unique" ON "saved_rolls" USING btree ("campaign_id","user_id","name_key");