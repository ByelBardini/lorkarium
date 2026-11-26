CREATE TYPE "public"."round_cycle_visibility" AS ENUM('everyone', 'some', 'masters');--> statement-breakpoint
ALTER TYPE "public"."asset_purpose" ADD VALUE 'round_cycle_phase';--> statement-breakpoint
CREATE TABLE "combat_round_cycles" (
	"combat_id" uuid NOT NULL,
	"cycle_id" uuid NOT NULL,
	"current_phase_id" uuid,
	"chosen_phase_id" uuid,
	CONSTRAINT "combat_round_cycles_combat_id_cycle_id_pk" PRIMARY KEY("combat_id","cycle_id")
);
--> statement-breakpoint
CREATE TABLE "round_cycle_members" (
	"cycle_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"can_see" boolean NOT NULL,
	"can_choose" boolean NOT NULL,
	CONSTRAINT "round_cycle_members_cycle_id_user_id_pk" PRIMARY KEY("cycle_id","user_id"),
	CONSTRAINT "round_cycle_members_choose_sees" CHECK (NOT "round_cycle_members"."can_choose" OR "round_cycle_members"."can_see")
);
--> statement-breakpoint
CREATE TABLE "round_cycle_phases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cycle_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"name" text NOT NULL,
	"image_asset_id" uuid
);
--> statement-breakpoint
CREATE TABLE "round_cycles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" uuid NOT NULL,
	"name" text NOT NULL,
	"visibility" "round_cycle_visibility" NOT NULL,
	"announce" boolean DEFAULT false NOT NULL,
	"holder_character_id" uuid,
	"holder_token_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "round_cycles_one_holder" CHECK ("round_cycles"."holder_character_id" IS NULL OR "round_cycles"."holder_token_id" IS NULL)
);
--> statement-breakpoint
ALTER TABLE "combat_round_cycles" ADD CONSTRAINT "combat_round_cycles_combat_id_combats_id_fk" FOREIGN KEY ("combat_id") REFERENCES "public"."combats"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "combat_round_cycles" ADD CONSTRAINT "combat_round_cycles_cycle_id_round_cycles_id_fk" FOREIGN KEY ("cycle_id") REFERENCES "public"."round_cycles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "combat_round_cycles" ADD CONSTRAINT "combat_round_cycles_current_phase_id_round_cycle_phases_id_fk" FOREIGN KEY ("current_phase_id") REFERENCES "public"."round_cycle_phases"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "combat_round_cycles" ADD CONSTRAINT "combat_round_cycles_chosen_phase_id_round_cycle_phases_id_fk" FOREIGN KEY ("chosen_phase_id") REFERENCES "public"."round_cycle_phases"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "round_cycle_members" ADD CONSTRAINT "round_cycle_members_cycle_id_round_cycles_id_fk" FOREIGN KEY ("cycle_id") REFERENCES "public"."round_cycles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "round_cycle_members" ADD CONSTRAINT "round_cycle_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "round_cycle_phases" ADD CONSTRAINT "round_cycle_phases_cycle_id_round_cycles_id_fk" FOREIGN KEY ("cycle_id") REFERENCES "public"."round_cycles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "round_cycle_phases" ADD CONSTRAINT "round_cycle_phases_image_asset_id_assets_id_fk" FOREIGN KEY ("image_asset_id") REFERENCES "public"."assets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "round_cycles" ADD CONSTRAINT "round_cycles_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "round_cycles" ADD CONSTRAINT "round_cycles_holder_character_id_characters_id_fk" FOREIGN KEY ("holder_character_id") REFERENCES "public"."characters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "round_cycles" ADD CONSTRAINT "round_cycles_holder_token_id_tokens_id_fk" FOREIGN KEY ("holder_token_id") REFERENCES "public"."tokens"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "combat_round_cycles_cycle_idx" ON "combat_round_cycles" USING btree ("cycle_id");--> statement-breakpoint
CREATE INDEX "round_cycle_members_user_idx" ON "round_cycle_members" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "round_cycle_phases_cycle_idx" ON "round_cycle_phases" USING btree ("cycle_id","position");--> statement-breakpoint
CREATE INDEX "round_cycles_campaign_idx" ON "round_cycles" USING btree ("campaign_id");--> statement-breakpoint
CREATE INDEX "round_cycles_holder_character_idx" ON "round_cycles" USING btree ("holder_character_id") WHERE "round_cycles"."holder_character_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "round_cycles_holder_token_idx" ON "round_cycles" USING btree ("holder_token_id") WHERE "round_cycles"."holder_token_id" IS NOT NULL;