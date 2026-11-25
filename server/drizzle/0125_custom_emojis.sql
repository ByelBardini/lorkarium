CREATE TABLE "custom_emojis" (
	"id" uuid PRIMARY KEY NOT NULL,
	"owner_id" uuid NOT NULL,
	"name" text NOT NULL,
	"animated" boolean NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "custom_emojis_owner_name_unique" UNIQUE("owner_id","name"),
	CONSTRAINT "custom_emojis_name_pattern" CHECK ("custom_emojis"."name" ~ '^[a-z0-9_]{2,32}$')
);
--> statement-breakpoint
ALTER TABLE "custom_emojis" ADD CONSTRAINT "custom_emojis_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;