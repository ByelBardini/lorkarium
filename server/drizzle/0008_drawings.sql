CREATE TYPE "public"."drawing_color" AS ENUM('gold', 'steel', 'ember', 'moss', 'ash', 'ink', 'bone', 'violet');--> statement-breakpoint
CREATE TYPE "public"."drawing_kind" AS ENUM('freehand', 'rectangle', 'ellipse', 'triangle');--> statement-breakpoint
CREATE TYPE "public"."stroke_width" AS ENUM('thin', 'medium', 'thick');--> statement-breakpoint
CREATE TABLE "drawings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"scene_id" uuid NOT NULL,
	"author_id" uuid,
	"draw_order" integer GENERATED ALWAYS AS IDENTITY (sequence name "drawings_draw_order_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"layer" "token_layer" NOT NULL,
	"kind" "drawing_kind" NOT NULL,
	"x" numeric(8, 2) NOT NULL,
	"y" numeric(8, 2) NOT NULL,
	"width" numeric(8, 2) NOT NULL,
	"height" numeric(8, 2) NOT NULL,
	"points" jsonb,
	"stroke" "drawing_color" NOT NULL,
	"fill" "drawing_color",
	"stroke_width" "stroke_width" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "drawings" ADD CONSTRAINT "drawings_scene_id_scenes_id_fk" FOREIGN KEY ("scene_id") REFERENCES "public"."scenes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drawings" ADD CONSTRAINT "drawings_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "drawings_scene_id_idx" ON "drawings" USING btree ("scene_id");