CREATE TYPE "public"."effect_area_kind" AS ENUM('square', 'circle', 'semicircle', 'orthogonal_cone', 'diagonal_cone', 'line', 'emanation', 'smooth_circle', 'smooth_semicircle');--> statement-breakpoint
CREATE TABLE "effect_areas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"scene_id" uuid NOT NULL,
	"author_id" uuid,
	"area_order" integer GENERATED ALWAYS AS IDENTITY (sequence name "effect_areas_area_order_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"kind" "effect_area_kind" NOT NULL,
	"x" numeric(8, 2) NOT NULL,
	"y" numeric(8, 2) NOT NULL,
	"width" numeric(8, 2) NOT NULL,
	"height" numeric(8, 2) NOT NULL,
	"reach" numeric(8, 2) NOT NULL,
	"facing" smallint DEFAULT 0 NOT NULL,
	"color" "drawing_color" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "effect_areas_facing_range" CHECK ("effect_areas"."facing" >= 0 AND "effect_areas"."facing" <= 359),
	CONSTRAINT "effect_areas_sizes_range" CHECK ("effect_areas"."x" >= 0 AND "effect_areas"."y" >= 0 AND "effect_areas"."width" >= 0 AND "effect_areas"."height" >= 0 AND "effect_areas"."reach" >= 0)
);
--> statement-breakpoint
ALTER TABLE "effect_areas" ADD CONSTRAINT "effect_areas_scene_id_scenes_id_fk" FOREIGN KEY ("scene_id") REFERENCES "public"."scenes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "effect_areas" ADD CONSTRAINT "effect_areas_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "effect_areas_scene_id_idx" ON "effect_areas" USING btree ("scene_id");