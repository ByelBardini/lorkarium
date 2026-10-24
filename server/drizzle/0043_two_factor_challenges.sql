CREATE TABLE "two_factor_challenges" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"persistent" boolean NOT NULL,
	"failures" integer DEFAULT 0 NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "two_factor_challenges" ADD CONSTRAINT "two_factor_challenges_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;