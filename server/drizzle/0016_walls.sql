CREATE TYPE "public"."door_state" AS ENUM('closed', 'open', 'locked');--> statement-breakpoint
CREATE TYPE "public"."wall_kind" AS ENUM('wall', 'grate', 'curtain', 'door');--> statement-breakpoint
CREATE TYPE "public"."wall_shape" AS ENUM('line', 'freehand', 'rectangle', 'ellipse');--> statement-breakpoint
CREATE TABLE "walls" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"scene_id" uuid NOT NULL,
	"wall_order" integer GENERATED ALWAYS AS IDENTITY (sequence name "walls_wall_order_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"kind" "wall_kind" NOT NULL,
	"shape" "wall_shape" NOT NULL,
	"x" numeric(8, 2) NOT NULL,
	"y" numeric(8, 2) NOT NULL,
	"width" numeric(8, 2) NOT NULL,
	"height" numeric(8, 2) NOT NULL,
	"points" jsonb,
	"door_state" "door_state",
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "walls_door_state" CHECK (("walls"."kind" = 'door') = ("walls"."door_state" IS NOT NULL)),
	CONSTRAINT "walls_door_line" CHECK ("walls"."kind" <> 'door' OR "walls"."shape" = 'line')
);
--> statement-breakpoint
ALTER TABLE "walls" ADD CONSTRAINT "walls_scene_id_scenes_id_fk" FOREIGN KEY ("scene_id") REFERENCES "public"."scenes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "walls_scene_id_idx" ON "walls" USING btree ("scene_id");