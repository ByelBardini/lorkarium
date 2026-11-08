CREATE TABLE "account_saved_colors" (
	"user_id" uuid NOT NULL,
	"color" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "account_saved_colors_user_id_color_pk" PRIMARY KEY("user_id","color"),
	CONSTRAINT "account_saved_colors_color_hex" CHECK ("account_saved_colors"."color" ~ '^#[0-9a-f]{6}$')
);
--> statement-breakpoint
ALTER TABLE "account_saved_colors" ADD CONSTRAINT "account_saved_colors_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;