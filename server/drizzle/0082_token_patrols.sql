CREATE TYPE "public"."token_patrol_repeat" AS ENUM('loop', 'bounce');--> statement-breakpoint
CREATE TABLE "token_patrols" (
	"token_id" uuid PRIMARY KEY NOT NULL,
	"path" jsonb NOT NULL,
	"repeat" "token_patrol_repeat" NOT NULL,
	"speed" numeric(4, 2) NOT NULL,
	"turns" boolean DEFAULT true NOT NULL,
	"step" integer DEFAULT 0 NOT NULL,
	"started_at" timestamp with time zone,
	CONSTRAINT "token_patrols_speed" CHECK ("token_patrols"."speed" BETWEEN 0.25 AND 4),
	CONSTRAINT "token_patrols_step" CHECK ("token_patrols"."step" >= 0)
);
--> statement-breakpoint
ALTER TABLE "token_patrols" ADD CONSTRAINT "token_patrols_token_id_tokens_id_fk" FOREIGN KEY ("token_id") REFERENCES "public"."tokens"("id") ON DELETE cascade ON UPDATE no action;