CREATE TABLE "saved_roll_folders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"name_key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "saved_roll_folders_name_length" CHECK (char_length("saved_roll_folders"."name") BETWEEN 1 AND 40)
);
--> statement-breakpoint
ALTER TABLE "saved_rolls" ADD COLUMN "folder_id" uuid;--> statement-breakpoint
ALTER TABLE "saved_roll_folders" ADD CONSTRAINT "saved_roll_folders_member_fk" FOREIGN KEY ("campaign_id","user_id") REFERENCES "public"."campaign_members"("campaign_id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "saved_roll_folders_member_name_unique" ON "saved_roll_folders" USING btree ("campaign_id","user_id","name_key");--> statement-breakpoint
ALTER TABLE "saved_rolls" ADD CONSTRAINT "saved_rolls_folder_id_saved_roll_folders_id_fk" FOREIGN KEY ("folder_id") REFERENCES "public"."saved_roll_folders"("id") ON DELETE set null ON UPDATE no action;