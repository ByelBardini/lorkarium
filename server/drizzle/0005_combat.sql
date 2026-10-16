CREATE TABLE "combatants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"combat_id" uuid NOT NULL,
	"token_id" uuid NOT NULL,
	"initiative" integer,
	"tie_order" integer NOT NULL,
	CONSTRAINT "combatants_combat_token_unique" UNIQUE("combat_id","token_id")
);
--> statement-breakpoint
CREATE TABLE "combats" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"scene_id" uuid NOT NULL,
	"round" integer DEFAULT 1 NOT NULL,
	"current_combatant_id" uuid,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "combats_scene_id_unique" UNIQUE("scene_id")
);
--> statement-breakpoint
ALTER TABLE "combatants" ADD CONSTRAINT "combatants_combat_id_combats_id_fk" FOREIGN KEY ("combat_id") REFERENCES "public"."combats"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "combatants" ADD CONSTRAINT "combatants_token_id_tokens_id_fk" FOREIGN KEY ("token_id") REFERENCES "public"."tokens"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "combats" ADD CONSTRAINT "combats_scene_id_scenes_id_fk" FOREIGN KEY ("scene_id") REFERENCES "public"."scenes"("id") ON DELETE cascade ON UPDATE no action;