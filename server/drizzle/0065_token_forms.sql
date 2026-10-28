CREATE TABLE "token_forms" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"token_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"name" text NOT NULL,
	"image_asset_id" uuid,
	"width" double precision NOT NULL,
	"height" double precision NOT NULL,
	CONSTRAINT "token_forms_token_id_position_unique" UNIQUE("token_id","position"),
	CONSTRAINT "token_forms_size_half_cells" CHECK ("token_forms"."width" BETWEEN 0.5 AND 10 AND "token_forms"."height" BETWEEN 0.5 AND 10 AND ("token_forms"."width" * 2) = floor("token_forms"."width" * 2) AND ("token_forms"."height" * 2) = floor("token_forms"."height" * 2))
);
--> statement-breakpoint
ALTER TABLE "tokens" ADD COLUMN "active_form_id" uuid;--> statement-breakpoint
ALTER TABLE "token_forms" ADD CONSTRAINT "token_forms_token_id_tokens_id_fk" FOREIGN KEY ("token_id") REFERENCES "public"."tokens"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "token_forms" ADD CONSTRAINT "token_forms_image_asset_id_assets_id_fk" FOREIGN KEY ("image_asset_id") REFERENCES "public"."assets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tokens" ADD CONSTRAINT "tokens_active_form_id_token_forms_id_fk" FOREIGN KEY ("active_form_id") REFERENCES "public"."token_forms"("id") ON DELETE set null ON UPDATE no action;