CREATE TABLE "saved_token_folders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"name_key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "saved_token_folders_name_length" CHECK (char_length("saved_token_folders"."name") BETWEEN 1 AND 40)
);
--> statement-breakpoint
CREATE TABLE "saved_token_forms" (
	"saved_token_id" uuid NOT NULL,
	"position" smallint NOT NULL,
	"name" text NOT NULL,
	"image_asset_id" uuid,
	"width" double precision NOT NULL,
	"height" double precision NOT NULL,
	"frame" "token_frame" DEFAULT 'square' NOT NULL,
	CONSTRAINT "saved_token_forms_pk" PRIMARY KEY("saved_token_id","position"),
	CONSTRAINT "saved_token_forms_position_range" CHECK ("saved_token_forms"."position" BETWEEN 0 AND 7),
	CONSTRAINT "saved_token_forms_size_half_cells" CHECK ("saved_token_forms"."width" BETWEEN 0.5 AND 10 AND "saved_token_forms"."height" BETWEEN 0.5 AND 10 AND ("saved_token_forms"."width" * 2) = floor("saved_token_forms"."width" * 2) AND ("saved_token_forms"."height" * 2) = floor("saved_token_forms"."height" * 2))
);
--> statement-breakpoint
CREATE TABLE "saved_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"folder_id" uuid,
	"name" text NOT NULL,
	"image_asset_id" uuid,
	"aura_image_asset_id" uuid,
	"active_form" smallint,
	"body" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "saved_tokens_name_length" CHECK (char_length("saved_tokens"."name") BETWEEN 1 AND 60),
	CONSTRAINT "saved_tokens_active_form_range" CHECK ("saved_tokens"."active_form" BETWEEN 0 AND 7)
);
--> statement-breakpoint
ALTER TABLE "saved_token_folders" ADD CONSTRAINT "saved_token_folders_member_fk" FOREIGN KEY ("campaign_id","user_id") REFERENCES "public"."campaign_members"("campaign_id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_token_forms" ADD CONSTRAINT "saved_token_forms_saved_token_id_saved_tokens_id_fk" FOREIGN KEY ("saved_token_id") REFERENCES "public"."saved_tokens"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_token_forms" ADD CONSTRAINT "saved_token_forms_image_asset_id_assets_id_fk" FOREIGN KEY ("image_asset_id") REFERENCES "public"."assets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_tokens" ADD CONSTRAINT "saved_tokens_folder_id_saved_token_folders_id_fk" FOREIGN KEY ("folder_id") REFERENCES "public"."saved_token_folders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_tokens" ADD CONSTRAINT "saved_tokens_image_asset_id_assets_id_fk" FOREIGN KEY ("image_asset_id") REFERENCES "public"."assets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_tokens" ADD CONSTRAINT "saved_tokens_aura_image_asset_id_assets_id_fk" FOREIGN KEY ("aura_image_asset_id") REFERENCES "public"."assets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_tokens" ADD CONSTRAINT "saved_tokens_member_fk" FOREIGN KEY ("campaign_id","user_id") REFERENCES "public"."campaign_members"("campaign_id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "saved_token_folders_member_name_unique" ON "saved_token_folders" USING btree ("campaign_id","user_id","name_key");--> statement-breakpoint
CREATE INDEX "saved_token_forms_image_idx" ON "saved_token_forms" USING btree ("image_asset_id") WHERE "saved_token_forms"."image_asset_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "saved_tokens_member_idx" ON "saved_tokens" USING btree ("campaign_id","user_id");--> statement-breakpoint
CREATE INDEX "saved_tokens_folder_idx" ON "saved_tokens" USING btree ("folder_id") WHERE "saved_tokens"."folder_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "saved_tokens_image_idx" ON "saved_tokens" USING btree ("image_asset_id") WHERE "saved_tokens"."image_asset_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "saved_tokens_aura_image_idx" ON "saved_tokens" USING btree ("aura_image_asset_id") WHERE "saved_tokens"."aura_image_asset_id" IS NOT NULL;